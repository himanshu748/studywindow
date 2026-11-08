/** Narrow deterministic recognizers, not a general-purpose summary of untrusted page prose. */
export type TextFacts = { value: string | null; quote: string | null; missingFields: string[] };
export type WeeklyHours = { min: number; max: number; quote: string };
const normalize = (text: string) =>
  text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const unsafe =
  /\b(?:ignore|disregard|override)\b.{0,60}\b(?:instructions?|rules?|system|prompt|budget)\b|\b(?:system|developer|assistant|tool)\s*(?:message|instructions?|permissions?|:)\b|\b(?:upload|exfiltrate|send|reveal|print|expose|steal)\b.{0,80}\b(?:credentials?|tokens?|secrets?|keys?|passwords?)\b|\b(?:fetch|visit|navigate|curl)\b.{0,70}(?:https?:|localhost|127\.|169\.254)|\b(?:pretend|invent|assume|output|return|report|say|claim|assert)\b.{0,60}\b(?:open[- ]entry|no prior|near[- ]native|fixed day|hours? per week|admission|eligible|qualif)/i;
const counterclaim =
  /\b(?:not true|not correct|not the case|does not mean|incorrect|false|untrue|not all|not every|not necessarily)\b/i;

/** A quote is an excerpt of at most eight source words, never a whole panel. */
export function factQuote(text: string): string | null {
  const words = normalize(text).split(' ').filter(Boolean);
  return words.length ? words.slice(0, 8).join(' ') : null;
}
function factualText(text: string): string {
  const normalized = normalize(text);
  return unsafe.test(normalized) ? '' : normalized;
}
function sentences(text: string): string[] {
  return factualText(text)
    .split(/(?<=[.!?])\s+|;\s*/)
    .filter((sentence) => sentence && !counterclaim.test(sentence));
}
function prefixNegates(sentence: string, index: number): boolean {
  return /\b(?:not|no|never|isn['’]t|aren['’]t)\b/i.test(
    sentence.slice(Math.max(0, index - 35), index),
  );
}
function range(min: string, max?: string): { min: number; max: number } | null {
  const result = { min: Number(min), max: Number(max ?? min) };
  return Number.isFinite(result.min) &&
    Number.isFinite(result.max) &&
    result.min >= 0 &&
    result.min <= result.max &&
    result.max <= 168
    ? result
    : null;
}
function rangeLabel(hours: { min: number; max: number }): string {
  return hours.min === hours.max ? String(hours.min) : `${hours.min}–${hours.max}`;
}
function summary(parts: string[]): string {
  return parts.join(' ').slice(0, 650);
}

export function summarizeRequirements(text: string): TextFacts {
  const present = Boolean(normalize(text));
  if (!present)
    return {
      value: null,
      quote: null,
      missingFields: ['entry_requirements', 'full_entry_conditions'],
    };
  const statements = sentences(text),
    facts: string[] = [],
    quotes: string[] = [];
  const add = (fact: string, quote: string) => {
    if (!facts.includes(fact)) {
      facts.push(fact);
      quotes.push(quote);
    }
  };
  for (const sentence of statements) {
    const open = /\b(?:open[- ]entry|(?:this|the) course is open to everyone|open to all)\b/i.exec(
      sentence,
    );
    if (
      open &&
      !prefixNegates(sentence, open.index) &&
      !/(?:not|isn['’]t)\s+(?:an?\s+)?open\b/i.test(sentence)
    )
      add('The published description states open entry.', open[0]);
    const prior =
      /\b(?:you\s+)?(?:do not|don['’]t) need any (?:previous|prior) (?:subject )?(?:knowledge|experience)(?: or (?:knowledge|experience))?\b|\bno (?:previous|prior) (?:subject )?(?:knowledge|experience)(?: or (?:knowledge|experience))? (?:is )?(?:required|needed|necessary)\b/i.exec(
        sentence,
      );
    if (prior && !prefixNegates(sentence, prior.index))
      add('No prior subject knowledge or experience is stated as necessary.', prior[0]);
    const english = /\b(?:all )?teaching is in English\b/i.exec(sentence);
    if (english && !prefixNegates(sentence, english.index))
      add('Teaching is in English.', english[0]);
    const near =
      /\b(?:you|participants?|students?|learners?) (should|must) have (?:a )?near[- ]native (?:command|level) of (?:the )?English(?: language)?\b/i.exec(
        sentence,
      );
    if (near && !prefixNegates(sentence, near.index))
      add(
        near[1]!.toLowerCase() === 'must'
          ? 'Near-native English is stated as required.'
          : 'Near-native English is advised.',
        near[0],
      );
    const proficiency = /\bEnglish proficiency (?:is )?(?:required|necessary)\b/i.exec(sentence);
    if (
      proficiency &&
      !prefixNegates(sentence, proficiency.index) &&
      !/^no\s+English proficiency/i.test(sentence)
    )
      add('English proficiency is stated as required.', proficiency[0]);
  }
  if (!facts.length)
    return {
      value:
        'Entry conditions are published but could not be summarized reliably. Read the source; individual eligibility is unassessed.',
      quote: null,
      missingFields: ['full_entry_conditions'],
    };
  facts.push('Full entry conditions and individual eligibility remain unassessed.');
  return {
    value: summary(facts),
    quote: factQuote(quotes[0] ?? ''),
    missingFields: ['full_entry_conditions'],
  };
}

/** Accept a direct overall workload statement only; never add classroom/self-study equivalents. */
export function totalWeeklyHours(text: string): WeeklyHours | null {
  const found: WeeklyHours[] = [];
  const pattern =
    /(?:expect(?:ed)? to (?:spend|study)|total (?:study|workload)|study (?:for|time)|workload of|commit(?:ment)?(?: of)?)\s*(?:approximately |roughly |around |about )?(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*hours? (?:of (?:study|work) )?(?:per|a|each) week/gi;
  for (const sentence of sentences(text)) {
    for (const match of sentence.matchAll(pattern)) {
      if (prefixNegates(sentence, match.index ?? 0)) continue;
      if (
        /\b(?:classroom|self[- ]study|independent study|seminars?|lectures?|contact hours?)\b/i.test(
          sentence,
        ) &&
        !/\btotal\b/i.test(sentence)
      )
        continue;
      const hours = range(match[1]!, match[2]);
      if (hours) found.push({ ...hours, quote: factQuote(match[0])! });
    }
  }
  const distinct = new Set(found.map((hours) => `${hours.min}:${hours.max}`));
  return distinct.size === 1 ? found[0]! : null;
}

export function summarizeTeaching(text: string): TextFacts {
  if (!normalize(text))
    return {
      value: null,
      quote: null,
      missingFields: ['teaching_commitments', 'complete_teaching_schedule'],
    };
  const statements = sentences(text),
    facts: string[] = [],
    quotes: string[] = [];
  const add = (fact: string, quote: string) => {
    if (!facts.includes(fact)) {
      facts.push(fact);
      quotes.push(quote);
    }
  };
  const overall = totalWeeklyHours(text);
  if (overall)
    add(`Published overall study workload: ${rangeLabel(overall)} hours per week.`, overall.quote);
  let weeklyClassroom = false;
  for (const sentence of statements) {
    const classroom =
      /\bequivalent to (\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))? hours? of classroom (?:time|teaching)\b/i.exec(
        sentence,
      );
    if (
      classroom &&
      !prefixNegates(sentence, classroom.index) &&
      /\b(?:each week|per week|weekly|a week)\b/i.test(sentence)
    ) {
      const hours = range(classroom[1]!, classroom[2]);
      if (hours) {
        weeklyClassroom = true;
        add(
          `Weekly classroom-time equivalent: ${/\b(?:roughly|approximately|about|around)\b/i.test(sentence) ? 'about ' : ''}${rangeLabel(hours)} hours; this is not a confirmed total workload.`,
          classroom[0],
        );
      }
    }
    const self =
      /\b(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))? hours? of self[- ]study(?: time)?\b/i.exec(
        sentence,
      );
    if (
      self &&
      !prefixNegates(sentence, self.index) &&
      (/\b(?:each week|per week|weekly|a week)\b/i.test(sentence) ||
        (weeklyClassroom && /^on top of this\b|^in addition\b/i.test(sentence))) &&
      !/\bper (?:day|term|month|course)\b/i.test(sentence)
    ) {
      const hours = range(self[1]!, self[2]);
      if (hours)
        add(
          `Separate self-study guidance: ${/\b(?:roughly|approximately|about|around)\b/i.test(sentence) ? 'about ' : ''}${rangeLabel(hours)} hours per week${/\bvary|varies|variable\b/i.test(sentence) ? '; individual needs vary' : ''}.`,
          self[0],
        );
    }
    const flexible =
      /\b(?:(?:would|will|do|does)\s+)?(?:(?:normally|usually|generally)\s+not|not\s+(?:normally|usually|generally))\s+require\b.{0,120}\bonline\b.{0,100}\bspecific (?:day|time)\b/i.exec(
        sentence,
      );
    if (flexible)
      add(
        'Normally no fixed online day/time is required; the full timetable remains unconfirmed.',
        flexible[0],
      );
    const recorded = /\b(?:web\s*seminars?|webinars?)\b.{0,70}\b(?:will be|are) recorded\b/i.exec(
      sentence,
    );
    if (recorded && !prefixNegates(sentence, recorded.index))
      add('Web seminars are stated to be recorded.', recorded[0]);
    const live =
      /\blive (?:teaching|sessions?|classes?) (?:is |are )?on ((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?)\b/i.exec(
        sentence,
      );
    if (live && !prefixNegates(sentence, live.index))
      add(
        `Published live teaching mentions ${live[1]}; required attendance is unconfirmed.`,
        live[0],
      );
  }
  if (!facts.length)
    return {
      value:
        'Teaching information is published but the supported time and delivery facts could not be established. Read the source; a complete schedule is unconfirmed.',
      quote: null,
      missingFields: ['complete_teaching_schedule'],
    };
  if (!facts.some((fact) => fact.includes('full timetable')))
    facts.push('The complete teaching schedule is unconfirmed.');
  return {
    value: summary(facts),
    quote: factQuote(quotes[0] ?? ''),
    missingFields: ['complete_teaching_schedule'],
  };
}

/** Mentioning a weekday does not establish a teaching commitment. */
export function scheduledWeekdaysFromTeaching(text: string): string[] {
  if (!factualText(text)) return [];
  const day = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?';
  const days = `${day}(?:\\s*(?:,|and|&)\\s*${day}){0,6}`;
  const activity = '(?:teaching|sessions?|classes|class|tutorials?|lectures?|seminars?|workshops?)';
  const verbs =
    '(?:(?:is|are)\\s+)?(?:(?:scheduled|held|run|runs|meet|meets|occur|occurs|taught|offered|conducted|delivered|take place|takes place)\\s+)?';
  const afterActivity = new RegExp(`\\b${activity}\\s+${verbs}(?:on|every)\\s+(${days})\\b`, 'gi');
  const beforeActivity = new RegExp(
    `\\b(?:on|every)\\s+(${days})\\s*,?\\s+(?:(?:we|you)\\s+(?:have|attend)\\s+|there\\s+(?:is|are)\\s+)?(?:(?:a|an|the|our|live|weekly)\\s+){0,3}${activity}\\b`,
    'gi',
  );
  const activityTable = new RegExp(
    `^\\s*(?:live\\s+)?${activity}(?:\\s+(?:day|days|schedule|timetable|time|times))?\\s*[:|–-]\\s*(${days})\\b`,
    'gi',
  );
  const time =
    '(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?(?:\\s*[-–]\\s*\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)?\\s*[:|–-]?\\s*)?';
  const weekdayTable = new RegExp(
    `^\\s*(${days})(?:\\s*[:|–-]\\s*|\\s+(?=\\d))${time}(?:live\\s+)?${activity}\\b`,
    'gi',
  );
  const matches = new Set<string>();
  const clauses: string[] = [];
  let excludedSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (!normalize(line)) {
      excludedSection = false;
      continue;
    }
    if (
      /^(?:examples?(?: (?:schedule|timetable))?|(?:no|not|optional)\b[^:]{0,50})\s*[:.]\s*$/i.test(
        normalize(line),
      )
    ) {
      excludedSection = true;
      continue;
    }
    if (!excludedSection) clauses.push(...sentences(line.replace(/\be\.g\./gi, 'for example')));
  }
  for (const clause of clauses) {
    if (
      /\b(?:no|not|never|don['’]t|doesn['’]t|isn['’]t|aren['’]t|won['’]t|cannot|can['’]t|optional|optionally|may|might|could|tentative|provisional|cancelled|canceled|suspended|postponed)\b/i.test(
        clause,
      )
    )
      continue;
    if (
      /\b(?:example|examples|for instance|illustration|hypothetical|assignment|assignments|assessment|submission|deadline|due)\b|\be\.g\./i.test(
        clause,
      )
    )
      continue;
    for (const pattern of [afterActivity, beforeActivity, activityTable, weekdayTable]) {
      for (const match of clause.matchAll(pattern)) {
        // A weekday range is not interpreted as an explicitly scheduled day list.
        if (
          new RegExp(`^\\s*(?:to|[-–])\\s*${day}\\b`, 'i').test(
            clause.slice((match.index ?? 0) + match[0].length),
          )
        )
          continue;
        for (const value of match[1]!.match(new RegExp(day, 'gi')) ?? [])
          matches.add(value.toLowerCase().replace(/s$/, ''));
      }
    }
  }
  return [...matches];
}
