// Mock data standing in for a real profile API.
const PROFILE = {
  name: 'Anya Forger',
  memberSince: 'Oct 2023',
};

export function getProfile() {
  return PROFILE;
}

export function updateProfile(patch) {
  Object.assign(PROFILE, patch);
  return PROFILE;
}

export function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
