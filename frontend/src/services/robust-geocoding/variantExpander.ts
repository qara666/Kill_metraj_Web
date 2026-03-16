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
export function expandVariants(raw: string, cityBias: string | null): ExpandedVariants {
  const cleaned = cleanAddress(raw)
  const all = generateStreetVariants(cleaned, cityBias)

  // ─── Phase 1: Identify high-priority resolved variants ───
  const renameResolved = new Set<string>()
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

