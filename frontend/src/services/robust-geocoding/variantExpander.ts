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
  // First, temporarily remove 5-digit postal codes so they aren't matched as house numbers
  const noPostal = raw.replace(/\b\d{5}\b/g, '')
  const m = noPostal.match(/\b\d+[\/\-\wа-яА-ЯёЁіІєЄґҐ]*/u)
  return m ? m[0] : null
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

  // Separate variants that had a rename applied
  const renameResolved = new Set<string>()
  const normalised = cleaned.toLowerCase()

  for (const [oldName, newName] of STREET_RENAMES) {
    const oldLc = oldName.toLowerCase()
    const newLc = newName.toLowerCase()
    if (normalised.includes(oldLc) || normalised.includes(newLc)) {
      for (const v of all) {
        const vl = v.toLowerCase()
        // Include only variants that contain the OTHER name (i.e. the rename was applied)
        if (
          (normalised.includes(oldLc) && vl.includes(newLc)) ||
          (normalised.includes(newLc) && vl.includes(oldLc))
        ) {
          renameResolved.add(v)
        }
      }
    }
  }

  const primary: string[] = []
  const secondary: string[] = []

  for (const v of all) {
    if (v === cleaned || renameResolved.has(v)) {
      primary.push(v)
    } else {
      secondary.push(v)
    }
  }

  return { primary, secondary, all }
}
