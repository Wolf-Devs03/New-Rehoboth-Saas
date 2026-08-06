/**
 * Dynamic Avatar Utility for Financial Datacenter.
 * Generates stable, distinct, professional portrait avatars or dynamic initial-based avatars
 * based on a user's name to eliminate confusion.
 */

// A curated list of 30 high-quality, professional portraits from Unsplash (highly diverse genders, ethnicities, and age ranges)
const AVATAR_PORTRAITS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80', // Male, professional
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80', // Female, professional
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', // Female, corporate
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', // Male, warm
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80', // Male, corporate
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', // Female, warm
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80', // Male, casual corporate
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80', // Female, creative
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80', // Male, classic
  'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80', // Female, tech
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80', // Female, friendly
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80', // Male, energetic
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=150&auto=format&fit=crop&q=80', // Female, professional
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80', // Male, friendly tech
  'https://images.unsplash.com/photo-1554151228-14d9def656e4?w=150&auto=format&fit=crop&q=80', // Female, bright
  'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=150&auto=format&fit=crop&q=80', // Male, mature
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80', // Female, glasses
  'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&auto=format&fit=crop&q=80', // Male, modern
  'https://images.unsplash.com/photo-1542103749-8ef59b94f4d3?w=150&auto=format&fit=crop&q=80', // Female, clear portrait
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80', // Male, energetic portrait
  'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80', // Male, professional
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80', // Male, corporate suite
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80', // Male, executive
  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=150&auto=format&fit=crop&q=80', // Female, executive
  'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80', // Female, light portrait
  'https://images.unsplash.com/photo-1509783265870-6ec296b0c2a1?w=150&auto=format&fit=crop&q=80', // Female, elegant
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80', // Female, outdoor portrait
  'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80', // Female, corporate look
  'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=150&auto=format&fit=crop&q=80', // Male, technical lead
  'https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=150&auto=format&fit=crop&q=80'  // Male, elegant portrait
];

/**
 * Generates a simple, stable numerical hash code for any string.
 * This guarantees the exact same name always maps to the same portrait.
 */
function getHashCode(str: string): number {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Returns a distinct stable portrait avatar URL for a given name.
 * Falls back to an initials SVG generator if name is empty or we want to bypass external assets.
 */
export function getAvatarUrl(name: string): string {
  const cleanName = (name || '').trim();
  if (!cleanName) {
    return 'https://ui-avatars.com/api/?name=User&background=random&color=fff&size=150&bold=true';
  }

  // Calculate stable index
  const hash = getHashCode(cleanName);
  const index = hash % AVATAR_PORTRAITS.length;
  
  return AVATAR_PORTRAITS[index];
}

/**
 * Returns a dynamic initials SVG fallback avatar if the user prefers.
 */
export function getInitialsAvatarUrl(name: string): string {
  const cleanName = (name || '').trim() || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random&color=fff&size=150&bold=true`;
}
