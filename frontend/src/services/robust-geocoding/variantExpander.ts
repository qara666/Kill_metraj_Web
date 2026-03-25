/**
 * Variant Expander
 *
 * Wraps `generateStreetVariants` from addressUtils and adds additional
 * ordering logic: rename-based variants are prioritised over raw token-swap
 * variants to minimise wasted API calls.
 */
import {
  cleanAddress,
  generateStreetVariants,
  STREET_RENAMES,
} from '../../utils/data/addressUtils'
import { extractParentheticalStreetName } from '../../utils/address/addressNormalization'

export { cleanAddress }


// ─── House number + postal extraction ────────────────────────────────────────

export function extractHouseNumber(raw: string): string | null {
  if (!raw) return null
  // First, temporarily remove 5-digit postal codes so they aren't matched as house numbers
  const noPostal = raw.replace(/\b\d{5}\b/g, '')
  // Match digits + optional letters + optional (slash/dash + optional digits + optional letters)
  // v35.9.25: Allow apostrophes in the lookbehind/lookahead if any, though usually hn doesn't have them
  const m = noPostal.match(/\b\d+[а-яієґa-z]*(?:[\/\-]\d*[а-яієґa-z]*)?\b/iu)
  return m ? m[0].toLowerCase() : null
}

export function extractPostalCode(raw: string): string | null {
  const m = raw.match(/\b\d{5}\b/)
  return m ? m[0] : null
}

// ─── Rename detection ─────────────────────────────────────────────────────────

/**
 * Returns true if the address contains any known old or new street name.
 */
export function usesKnownRename(address: string): boolean {
  const addr = address.toLowerCase()
  return STREET_RENAMES.some(
    ([oldName, newName]) =>
      addr.includes(oldName.toLowerCase()) || addr.includes(newName.toLowerCase())
  )
}

// ─── Variant generation ───────────────────────────────────────────────────────

export interface ExpandedVariants {
  /** Variants most likely to produce a good hit (rename-resolved first) */
  primary: string[]
  /** Remaining variants to try if primary fails */
  secondary: string[]
  /** All variants combined */
  all: string[]
}

/**
 * Generate an ordered list of address variants for geocoding.
 * The ordering maximises early-exit opportunities (fewer API calls).
 *
 * Strategy:
 * 1. Cleaned original address
 * 2. Rename-resolved variants (old→new and new→old)
 * 3. Token-swap variants (вул.↔вулиця etc.)
 * 4. Parenthetical old names
 * 5. District/neighbourhood hints
 */
export function expandVariants(raw: string, cityBias: string | null, forceCity: boolean = false): ExpandedVariants {
  const cleaned = cleanAddress(raw)
  let all = generateStreetVariants(cleaned, cityBias)

  // v5.106: Force City Prefix
  if (forceCity && cityBias) {
      all = all.map(v => {
          const lv = v.toLowerCase();
          const lc = cityBias.toLowerCase();
          if (!lv.includes(lc)) return `${cityBias}, ${v}`;
          return v;
      });
  }

  // ─── Phase 0.5: Parenthetical Alternative Name (v39: PRIMARY-FIRST) ───────
  // For Ukrainian addresses like "вул. Йорданська (Гавро), 24б":
  //   - "Гавро" is the OLD/POPULAR name OSM knows better
  //   - We extract it and make it a TOP-PRIORITY PRIMARY variant
  const renameResolved = new Set<string>()
  
  const altName = extractParentheticalStreetName(raw);
  if (altName) {
      const houseNum = extractHouseNumber(raw) || '';
      const cityPrefix = cityBias ? `${cityBias}, ` : '';
      
      // Build multiple query forms for the alternative name
      const altQueries: string[] = [
          // Bare name (works best with Photon/Nominatim for common names)
          `${cityPrefix}${altName}${houseNum ? ', ' + houseNum : ''}`.trim(),
          // With вул. prefix (most common street type in Kyiv)
          `${cityPrefix}вул. ${altName}${houseNum ? ', ' + houseNum : ''}`.trim(),
          // With просп. prefix (for avenues)
          `${cityPrefix}просп. ${altName}${houseNum ? ', ' + houseNum : ''}`.trim(),
          // With пров. prefix (for side streets)
          `${cityPrefix}пров. ${altName}${houseNum ? ', ' + houseNum : ''}`.trim(),
      ];
      
      for (const q of altQueries) {
          if (q && !all.includes(q)) {
              all.unshift(q); // ADD TO FRONT - highest priority
          }
          renameResolved.add(q);
      }
      
      // Also generate full variants from the alt name for renames
      const altClean = cleanAddress(`${altName}${houseNum ? ', ' + houseNum : ''}`);
      const altVariants = generateStreetVariants(altClean, cityBias);
      for (const av of altVariants) {
          if (!all.includes(av)) all.push(av);
          renameResolved.add(av);
      }
      
      console.log(`[VariantExpander] Alt name found: "${altName}" from "${raw}". Querying as primary.`);
  } else {
      // Legacy fallback: detect via raw paren regex (for complex inner content)
      const parenMatch = raw.match(/\((.*?)\)/);
      if (parenMatch) {
          const parenContent = parenMatch[1].trim();
          if (parenContent.length > 3 && !parenContent.match(/\b(під|кв|эт|д\/ф|моб|офис|вход|дверь)\b/i)) {
              const houseNum = extractHouseNumber(raw) || '';
              const cityPrefix = cityBias ? `${cityBias}, ` : '';
              const parenVariant = `${cityPrefix}${parenContent} ${houseNum}`.trim();
              const parenVariants = generateStreetVariants(parenVariant, cityBias);
              all.push(...parenVariants);
              renameResolved.add(parenVariant);
              if (parenVariants.length > 0) renameResolved.add(parenVariants[0]);
          }
      }
  }

  // ─── Phase 1: Identify high-priority resolved variants ───
  const normalised = cleaned.toLowerCase()

  for (const [oldName, newName] of STREET_RENAMES) {
    const oldLc = oldName.toLowerCase()
    const newLc = newName.toLowerCase()
    if (normalised.includes(oldLc) || normalised.includes(newLc)) {
      for (const v of all) {
        const vl = v.toLowerCase()
        if (
          (normalised.includes(oldLc) && vl.includes(newLc)) ||
          (normalised.includes(newLc) && vl.includes(oldLc))
        ) {
          renameResolved.add(v)
        }
      }
    }
  }

  // ─── Phase 2: Identify "Knowledge-based" boosts (ЖК, м-н) ───
  const boosted = new Set<string>()
  const isLcOrMh = /\b(жк|ж\/к|жилой комплекс|житловий комплекс|м-н|мікрорайон|микрорайон)\b/i.test(normalised)
  
  if (isLcOrMh) {
    for (const v of all) {
      if (v.includes('ЖК') || v.includes('м-н') || v.toLowerCase().includes('комплекс')) {
        boosted.add(v)
      }
    }
  }

  // ─── Phase 3: Stripped Prefix Variant ───
  const stripped = cleaned.replace(/\b(вул\.?|вулиця|улица|ул\.?|пров\.?|провулок|просп\.?|проспект|бул\.?|бульвар|пл\.?|площа)\b/gi, '').replace(/\s+/g, ' ').trim()
  if (stripped && stripped !== cleaned && !all.includes(stripped)) {
    all.push(stripped)
  }

  // ─── Phase 4: Street Only Variant (Fallback if OSM lacks the house number) ───
  const houseNum = extractHouseNumber(cleaned)
  if (houseNum) {
    const escapedHouse = houseNum.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    const streetRegex = new RegExp(`(?:,|\\s)*${escapedHouse}.*$`, 'i')
    
    // Create street only variants for ALL current variants to support renames
    const existingVariants = [...all]
    for (const v of existingVariants) {
      const streetOnly = v.replace(streetRegex, '').trim()
      if (streetOnly && streetOnly !== v && !all.includes(streetOnly)) {
        all.push(streetOnly)
      }
    }
  }

  // ─── Phase 5: Specific Renames (e.g., Отдыха/Відпочинку) ───
  if (normalised.includes('отдыха') || normalised.includes('відпочинку')) {
    const variant = cleaned.replace(/отдыха|відпочинку/gi, 'Відпочинку')
    if (variant !== cleaned) {
      if (!all.includes(variant)) all.push(variant)
      renameResolved.add(variant)
    }
  }

  // Phase 5.1: Critical Kyiv Renames (Viliamsa -> Rudnytskoho)
  if (normalised.includes('вильямса') || normalised.includes('вільямса')) {
    const variant = cleaned.replace(/вильямса|вільямса/gi, 'Степана Рудницького')
    if (variant !== cleaned) {
      if (!all.includes(variant)) all.push(variant)
      renameResolved.add(variant)
    }
  }

  // ─── Phase 6: Safety Fallback (NEVER EMPTY) ───
  if (all.length === 0) {
     all.push(cleaned)
     if (cityBias) all.push(`${cleaned}, ${cityBias}`)
  }

  const primary: string[] = []
  const secondary: string[] = []

  for (let i = 0; i < all.length; i++) {
    const v = all[i]
    const vl = v.toLowerCase()
    const cl = cleaned.toLowerCase()
    
    // Priority: First variant (base) IS ALWAYS PRIMARY, then Renames, then Boosted (ЖК)
    // We check if vl starts with cl or vice versa to handle city suffixes
    if (i === 0 || vl.includes(cl) || cl.includes(vl) || renameResolved.has(v) || boosted.has(v)) {
      primary.push(v)
    } else {
      secondary.push(v)
    }
  }

  // Sort primary to put rename/boosted right after cleaned
  primary.sort((a, b) => {
    if (a === cleaned) return -1
    if (b === cleaned) return 1
    const aScore = (renameResolved.has(a) ? 2 : 0) + (boosted.has(a) ? 1 : 0)
    const bScore = (renameResolved.has(b) ? 2 : 0) + (boosted.has(b) ? 1 : 0)
    return bScore - aScore
  })

  return { primary, secondary, all }
}

