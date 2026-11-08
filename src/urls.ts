import { StudyError } from './errors.js';
export const ORIGIN = 'https://www.pace.cam.ac.uk';
export const CATALOGUE = ORIGIN + '/course-search';
export function courseUrl(input: string): string {
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input) && input.length <= 200)
    return `${ORIGIN}/courses/${input}`;
  if (/^node:[1-9][0-9]{0,7}$/.test(input)) return `${ORIGIN}/node/${input.slice(5)}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new StudyError(
      'INVALID_INPUT',
      'Use a Cambridge course id or an exact supported course URL.',
    );
  }
  if (
    url.origin !== ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /%|\\/.test(input) ||
    !/^\/(?:courses\/[a-z0-9]+(?:-[a-z0-9]+)*|node\/[1-9][0-9]{0,7})$/.test(url.pathname)
  )
    throw new StudyError(
      'INVALID_INPUT',
      'Only canonical www.pace.cam.ac.uk course paths are supported.',
    );
  return url.href;
}
export function courseId(input: string): string {
  const u = new URL(courseUrl(input));
  return u.pathname.startsWith('/node/') ? `node:${u.pathname.slice(6)}` : u.pathname.slice(9);
}
export function searchUrl(topic: string, modeValue?: string, page = 0): string {
  const u = new URL(CATALOGUE);
  u.searchParams.set('search_api_fulltext', topic);
  if (modeValue) u.searchParams.set('field_method', modeValue);
  if (page) u.searchParams.set('page', String(page));
  return u.href;
}
export function validateCatalogueUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new StudyError('SITE_CHANGED', 'The catalogue returned an invalid URL.');
  }
  if (
    u.origin !== ORIGIN ||
    u.pathname !== '/course-search' ||
    u.username ||
    u.password ||
    u.hash ||
    [...u.searchParams.keys()].some(
      (k) =>
        ![
          'search_api_fulltext',
          'field_method',
          'field_subject_categories',
          'field_course_type',
          'page',
        ].includes(k),
    )
  )
    throw new StudyError('SITE_CHANGED', 'The catalogue navigation left the supported source.');
  return u;
}
