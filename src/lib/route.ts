export function parseRoute(hash: string): string {
  if (hash === '' || hash === '#' || hash === '#/') return 'home';
  return hash.replace(/^#\//, '').split('/')[0] || 'home';
}
