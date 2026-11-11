import { load } from 'cheerio';
import { StudyError } from './errors.js';
import { RawCourse, dateRange, normalize } from './extract.js';
import { courseUrl } from './urls.js';

/** Read literal fields in the current Fetch HTML; never execute scripts or infer missing panels. */
export function courseFromFreshHtml(
  html: string,
  url: string,
  expectedTitle: string,
  requestedPanels: string[],
) {
  courseUrl(url);
  const $ = load(html);
  $('script, style, template, noscript').remove();
  const main = $('main');
  const h1 = main.find('h1');
  if (
    main.length !== 1 ||
    h1.length !== 1 ||
    !normalize(h1.text()) ||
    normalize(h1.text()) !== normalize(expectedTitle)
  )
    throw new StudyError('SITE_CHANGED', 'Fresh Fetch HTML has no unambiguous course heading.');
  if (
    /^(?:access denied|forbidden|sign in|log in|service unavailable|bad gateway|page not found)$/i.test(
      normalize(h1.text()),
    ) ||
    main.find('input[type="password"]').length
  )
    throw new StudyError('SITE_BLOCKED', 'Fresh Fetch HTML does not contain a public course.');
  for (const identity of $('link[rel="canonical"], meta[property="og:url"]').toArray()) {
    const value = $(identity).attr('href') ?? $(identity).attr('content');
    let matches = false;
    try {
      matches = !!value && courseUrl(new URL(value, url).href) === url;
    } catch {}
    if (!matches)
      throw new StudyError('SITE_CHANGED', 'Fresh Fetch HTML identifies a different course.');
  }
  const dates = main.find('.accordion--course-instances');
  const items = dates.find('.accordion-item');
  if (dates.length !== 1 || items.length < 1 || items.length > 3)
    throw new StudyError('SITE_CHANGED', 'Fresh Fetch HTML has unsupported course offerings.');
  const offerings = items.toArray().map((item) => {
    const offering = $(item);
    const button = offering
      .find('.accordion-item__button')
      .filter((_, element) => $(element).closest('.accordion-item')[0] === item);
    const details = offering.find('.course-details');
    const dateLabel = normalize(button.text());
    const [start, end] = dateRange(dateLabel);
    if (button.length !== 1 || details.length !== 1 || !start || !end || start > end)
      throw new StudyError('SITE_CHANGED', 'Fresh Fetch HTML has incomplete offering dates.');
    const fields = details
      .find('.course-details__item')
      .toArray()
      .map((element) => {
        const field = $(element);
        const labelElement = field.find('.course-details__item-label');
        const label = normalize(labelElement.text());
        const supported =
          RawCourse.shape.offerings.element.shape.fields.element.shape.label.safeParse(label);
        const copy = field.clone();
        copy.find('.course-details__item-label').remove();
        const value = normalize(copy.text());
        if (labelElement.length !== 1 || !supported.success || !value)
          throw new StudyError('SITE_CHANGED', 'Fresh Fetch HTML has incomplete offering fields.');
        return { label: supported.data, value };
      });
    const labels = fields.map((field) => field.label);
    if (
      new Set(labels).size !== labels.length ||
      !['Course fee', 'Study mode', 'Application Deadline', 'Duration', 'Course code'].every(
        (label) => labels.includes(label as (typeof labels)[number]),
      )
    )
      throw new StudyError(
        'SITE_CHANGED',
        'Fresh Fetch HTML lacks complete supported offering fields.',
      );
    // Availability is an AJAX observation. Its presence in Fetch HTML cannot establish current places.
    return { date_label: dateLabel, fields, status: '' };
  });
  const panels = requestedPanels.map((label) => {
    const buttons = main
      .find('.accordion-item__button')
      .filter((_, element) => normalize($(element).text()).toLowerCase() === label.toLowerCase());
    const item = buttons.closest('.accordion-item');
    const content = item
      .find('.accordion-item__content')
      .filter((_, element) => $(element).closest('.accordion-item')[0] === item[0]);
    const text = normalize(content.text());
    if (buttons.length !== 1 || content.length !== 1 || !text)
      throw new StudyError('SITE_CHANGED', 'A requested panel is absent from fresh Fetch HTML.');
    return { label, text };
  });
  const result = RawCourse.safeParse({
    page_url: url,
    title: normalize(h1.text()),
    blocked: false,
    offerings,
    panels,
    dates_found: offerings.length,
    all_details_loaded: true,
  });
  if (!result.success)
    throw new StudyError('SITE_CHANGED', 'Fresh Fetch HTML exceeds the supported course contract.');
  return result.data;
}
