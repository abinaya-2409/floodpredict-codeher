import {
  CityData,
  RiskComponent,
  SimulationParams,
  ZoneData,
  ZoneRiskAssessment,
} from '../types';
import { recommendResources } from './dispatch';
import { historyForPoint } from './tnHistory';

/**
 * The incident briefing, written from the model rather than by a model.
 *
 * This replaced a call to a hosted LLM, for a reason worth stating: every
 * hosted model needs an API key, the key in production has been rejected for
 * weeks, and the fallback shown in its place was invented prose - "exceeding
 * local percolation limits by 240%", "runoff coefficient exceeding 0.85" -
 * with no connection to anything the application had computed.
 *
 * A briefing is a structured document built from numbers that already exist:
 * which wards score worst, how deep the water gets, how long there is, how
 * many people need help, what to send. Composing that in code means it always
 * works, needs no key or quota, answers instantly, and cannot invent a figure
 * - which is the failure mode that matters when the output is an evacuation
 * order.
 *
 * A language model can still be pointed at this, and one is when a key is
 * configured. Its job is to turn these facts into prose. The facts stay here.
 */

export interface BriefingSection {
  heading: string;
  /** Rendered as bullets. */
  lines: string[];
}

export interface IncidentBriefing {
  title: string;
  /** One sentence a commissioner can act on. */
  headline: string;
  severity: 'routine' | 'watch' | 'warning' | 'emergency';
  generatedAt: string;
  sections: BriefingSection[];
  /** Everything above is derived from these, so they are worth stating. */
  basis: string;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function formatMinutes(mins: number): string {
  if (mins >= 1440) return `${Math.round(mins / 1440)} ${plural(Math.round(mins / 1440), 'day')}`;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}min` : `${h} ${plural(h, 'hour')}`;
  }
  return `${mins} min`;
}

/** The loudest component of a ward's score, so the briefing can say why. */
function dominantDriver(a: ZoneRiskAssessment): string {
  const parts: [string, RiskComponent, number][] = [
    ['deep water', a.hazard, 0.35],
    ['the number of people in the way', a.exposure, 0.2],
    ['who lives there', a.fragility, 0.25],
    ['nowhere to put people and blocked drains', a.copingDeficit, 0.2],
  ];
  const top = parts
    .map(([label, comp, w]) => ({ label, weighted: (comp?.score ?? 0) * w }))
    .sort((x, y) => y.weighted - x.weighted)[0];
  return top?.label ?? 'combined factors';
}

function severityOf(worst: ZoneRiskAssessment | undefined, deepest: number): IncidentBriefing['severity'] {
  if (!worst) return 'routine';
  if (deepest >= 75 || worst.vri >= 70) return 'emergency';
  if (deepest >= 50 || worst.vri >= 50) return 'warning';
  if (deepest >= 15 || worst.vri >= 30) return 'watch';
  return 'routine';
}

/**
 * Builds the briefing.
 *
 * Every figure here is read from the assessments and the zone model. Nothing
 * is looked up, estimated or phrased as more certain than it is.
 */
export function buildIncidentBriefing(
  city: CityData,
  zones: ZoneData[],
  assessments: ZoneRiskAssessment[],
  params: SimulationParams
): IncidentBriefing {
  const ranked = [...assessments].sort((a, b) => b.priorityScore - a.priorityScore);
  const worst = ranked[0];
  const byId = new Map(zones.map((z) => [z.id, z]));

  const deepest = zones.reduce((m, z) => Math.max(m, z.predictedInundationDepthCm), 0);
  const flooding = zones.filter((z) => z.predictedInundationDepthCm >= 15);
  const totalAtRisk = assessments.reduce((s, a) => s + a.populationAtRisk, 0);
  const totalAssisted = assessments.reduce((s, a) => s + a.assistedEvacuationNeeded, 0);
  const soonest = ranked.reduce(
    (m, a) => Math.min(m, a.leadTimeToFloodMins),
    Number.POSITIVE_INFINITY
  );

  const blocked = city.drainageChannels.filter(
    (d) => params.blockedDrainIds.includes(d.id) || d.isBlocked
  );

  const severity = severityOf(worst, deepest);

  /* ---------------------------------------------------------- situation -- */

  const situation: string[] = [
    `Rain modelled at ${params.rainfallIntensityMmHr} mm/hr for ${params.durationHours} ${plural(
      params.durationHours,
      'hour'
    )} over ${city.name}.`,
  ];

  if (flooding.length === 0) {
    situation.push(
      `No ward reaches 15 cm of standing water at this rainfall. The deepest is ${deepest} cm.`
    );
  } else {
    situation.push(
      `${flooding.length} of ${zones.length} ${plural(zones.length, 'ward')} pass 15 cm. ` +
        `The deepest is ${deepest} cm.`
    );
    if (Number.isFinite(soonest)) {
      situation.push(`Least time to prepare anywhere: ${formatMinutes(soonest)}.`);
    }
  }

  situation.push(
    `${totalAtRisk.toLocaleString('en-IN')} people live in the areas that flood. ` +
      `${totalAssisted.toLocaleString('en-IN')} of them cannot leave without help.`
  );

  if (blocked.length) {
    situation.push(
      `${blocked.length} ${plural(blocked.length, 'drain')} blocked: ` +
        blocked.map((d) => `${d.name} (${d.chokePercentage}% choked)`).join('; ') +
        '.'
    );
  }

  /* -------------------------------------------------------- worst wards -- */

  // Ordered by priority - how bad, weighted by how soon - not by depth alone.
  // The deepest ward is not always the one to reach first.
  const worstWards = ranked.slice(0, 4).map((a) => {
    const zone = byId.get(a.zoneId);
    const depth = zone?.predictedInundationDepthCm ?? 0;
    return (
      `${a.zoneName} - risk ${a.vri}/100, ${depth} cm of water, ` +
      `${formatMinutes(a.leadTimeToFloodMins)} to act. ` +
      `${a.populationAtRisk.toLocaleString('en-IN')} at risk, ` +
      `${a.assistedEvacuationNeeded.toLocaleString('en-IN')} need help to leave. ` +
      `Driven mostly by ${dominantDriver(a)}.`
    );
  });

  /* ------------------------------------------------------------ actions -- */

  const resources = recommendResources(assessments, zones, city);
  const actions: string[] = [];

  // Group by ward: a commissioner dispatches to a place, not to a category.
  const byZone = new Map<string, typeof resources>();
  for (const r of resources) {
    const list = byZone.get(r.zoneId) ?? [];
    list.push(r);
    byZone.set(r.zoneId, list);
  }

  const zoneName = (id: string) => byId.get(id)?.name ?? id;
  const ordered = ranked.filter((a) => byZone.has(a.zoneId)).slice(0, 4);

  for (const a of ordered) {
    const items = (byZone.get(a.zoneId) ?? [])
      .map((r) => `${r.recommendedUnits} × ${r.name}`)
      .join(', ');
    const urgent = (byZone.get(a.zoneId) ?? []).some((r) => r.priority === 'CRITICAL');
    actions.push(`${zoneName(a.zoneId)}${urgent ? ' (critical)' : ''}: send ${items}.`);
  }

  if (blocked.length) {
    actions.push(
      `Clear ${blocked.map((d) => d.name).join(' and ')} before the peak - ` +
        'a blocked drain is the fastest thing on this list to fix.'
    );
  }
  if (!actions.length) {
    actions.push('Nothing to dispatch at this rainfall. Keep crews on standby.');
  }

  /* ---------------------------------------------------------- residents -- */

  const residents: string[] = [];
  if (severity === 'routine') {
    residents.push('No public warning needed at this rainfall.');
  } else {
    const worstZone = worst ? byId.get(worst.zoneId) : undefined;
    residents.push(
      `Tell people in ${ranked
        .slice(0, 3)
        .map((a) => a.zoneName)
        .join(', ')} to move vehicles and valuables above ${Math.max(
        30,
        Math.ceil((worstZone?.predictedInundationDepthCm ?? 30) / 10) * 10
      )} cm now.`
    );
    residents.push('Switch off power at the mains before water reaches sockets.');
    residents.push('Do not walk or drive through moving water. Do not use underpasses.');
    if (totalAssisted > 0) {
      residents.push(
        `${totalAssisted.toLocaleString('en-IN')} people need help to leave - ` +
          'check on elderly and disabled neighbours before the water rises.'
      );
    }
  }

  /* ------------------------------------------------------------ history -- */

  const history = historyForPoint(city.lat, city.lng);
  const past: string[] = [];
  if (history?.floodEvents.length) {
    past.push(
      `${history.district} has ${history.floodCount} recorded flood or cyclone ` +
        `${plural(history.floodCount, 'event')} since 2016, with ` +
        `${history.floodDeaths} recorded deaths.`
    );
    for (const e of [...history.floodEvents].sort((a, b) => b.year - a.year).slice(0, 3)) {
      past.push(`${e.year}: ${e.name}${e.deaths !== null ? ` - ${e.deaths} died` : ''}.`);
    }
  }

  /* ----------------------------------------------------------- assemble -- */

  const headline =
    severity === 'routine'
      ? `No flooding expected in ${city.name} at ${params.rainfallIntensityMmHr} mm/hr.`
      : `Start with ${worst?.zoneName ?? city.name}: ${
          byId.get(worst?.zoneId ?? '')?.predictedInundationDepthCm ?? 0
        } cm of water and only ${formatMinutes(worst?.leadTimeToFloodMins ?? 0)} to act. ` +
        `Across ${city.name}, ${totalAssisted.toLocaleString('en-IN')} people cannot leave ` +
        'without help.';

  const sections: BriefingSection[] = [
    { heading: 'What is happening', lines: situation },
  ];
  if (worstWards.length) sections.push({ heading: 'Where to go first', lines: worstWards });
  sections.push({ heading: 'What to do now', lines: actions });
  sections.push({ heading: 'What to tell residents', lines: residents });
  if (past.length) sections.push({ heading: 'This has happened here before', lines: past });

  return {
    title: `Incident briefing - ${city.name}`,
    headline,
    severity,
    generatedAt: new Date().toISOString(),
    sections,
    basis:
      `Built from this application's own flood model: ${zones.length} modelled ` +
      `${plural(zones.length, 'ward')}, the vulnerability index, and the Tamil Nadu ` +
      'disaster record. No language model, no external service, and no figure that ' +
      'is not computed from the inputs above.',
  };
}

/** Plain text, for copying into an email or a WhatsApp message. */
export function briefingToText(b: IncidentBriefing): string {
  const out = [b.title.toUpperCase(), '', b.headline, ''];
  for (const s of b.sections) {
    out.push(`${s.heading.toUpperCase()}`);
    for (const line of s.lines) out.push(`  - ${line}`);
    out.push('');
  }
  out.push(b.basis);
  return out.join('\n');
}

/* ---------------------------------------------------------------------------
 * Prose, without a model
 *
 * "Rewrite as prose" used to be the one part of this panel that could not
 * work on its own: with no API key it showed a configuration notice and did
 * nothing, which in an application built for the moment the towers go down
 * is the wrong way round. The network is the first thing a flood takes.
 *
 * Turning a set of computed facts into paragraphs does not need a 70B model.
 * It needs the facts joined in a sensible order with connecting words, which
 * is what this does - and because it only ever reorders and joins strings
 * that were computed upstream, it cannot invent a number. That is the exact
 * failure the model prompt spends a paragraph trying to prevent.
 *
 * A model is still better at cadence, and is still used when one is
 * configured. This is the floor, not the ceiling.
 * ------------------------------------------------------------------------ */

/** Lowercases a sentence's first letter so it can be joined mid-sentence. */
function decapitalise(s: string): string {
  // Not on an acronym or a place name: "OMR Tech Corridor" must stay put.
  if (/^[A-Z]{2,}/.test(s)) return s;
  if (/^[A-Z][a-z]+ [A-Z]/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Strips a trailing full stop so a line can take a different one. */
const unpunctuated = (s: string) => s.replace(/[.\s]+$/, '');

/**
 * Joins lines into one paragraph.
 *
 * Long lines stay as their own sentences; short ones are run together with
 * connectives, because a paragraph of six five-word sentences reads worse
 * than the bullet list it replaced.
 */
function paragraph(lines: string[], lead?: string): string {
  const parts = lines.map(unpunctuated).filter(Boolean);
  if (!parts.length) return '';

  const sentences: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const head = parts[i];
    const next = parts[i + 1];
    if (next && head.length < 70 && next.length < 70) {
      sentences.push(`${head}, and ${decapitalise(next)}`);
      i += 2;
    } else {
      sentences.push(head);
      i += 1;
    }
  }

  const body = sentences.map((s) => `${s}.`).join(' ');
  return lead ? `${lead} ${body}` : body;
}

/**
 * The briefing as paragraphs rather than bullets.
 *
 * Every word of substance here came from `buildIncidentBriefing`; this adds
 * only the joins.
 */
export function briefingToProse(b: IncidentBriefing): string {
  const find = (h: string) => b.sections.find((s) => s.heading.toLowerCase() === h)?.lines ?? [];

  const situation = find('what is happening');
  const worst = find('where to go first');
  const actions = find('what to do now');
  const residents = find('what to tell residents');
  const past = find('this has happened here before');

  const leads: Record<string, string | undefined> = {
    // Deliberately not "4 areas need attention": a count is a number, and
    // the guarantee this composer offers is that it emits no digit that the
    // briefing did not already contain. A count is easy to derive and just
    // as easy to derive wrongly, and the list that follows says how many.
    worst: worst.length ? (worst.length === 1 ? 'Start here.' : 'Start here, in order.') : undefined,
    actions: actions.length ? 'Immediate steps:' : undefined,
    residents: residents.length ? 'For residents:' : undefined,
    past: past.length ? 'For context,' : undefined,
  };

  const paragraphs = [
    unpunctuated(b.headline) + '.',
    paragraph(situation),
    paragraph(worst, leads.worst),
    paragraph(actions, leads.actions),
    paragraph(residents, leads.residents),
    paragraph(past, leads.past),
  ].filter(Boolean);

  return paragraphs.join(String.fromCharCode(10, 10));
}
