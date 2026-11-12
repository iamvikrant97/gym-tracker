export function parseRoute(hash: string): string {
  const h = hash.split('?')[0]; // '#/?name=x' and '#/progress?name=x': the query is not part of the route
  if (h === '' || h === '#' || h === '#/') return 'home';
  return h.replace(/^#\//, '').split('/')[0] || 'home';
}
