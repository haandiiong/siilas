import { airports } from './airport-data';
import { airportProfiles } from './airport-profiles';

type RecordedCondition = boolean | null;
type AccessMode = 'subscription' | 'official' | 'both' | null;

interface NavigationAirport {
  slug: string;
  name: string;
  kind: 'tested' | 'reference';
  price: string;
  reviewedAt: string;
  accessMode: AccessMode;
  noExpiry: RecordedCondition;
  trial: RecordedCondition;
  clientNotes: string;
}

export interface AirportTutorialLink {
  href: string;
  label: string;
}

const recordedSupport = (value?: string): RecordedCondition => {
  if (/^不支持/u.test(value ?? '')) return false;
  if (/^支持/u.test(value ?? '')) return true;
  return null;
};

const subscriptionSupport = (value?: string): RecordedCondition => {
  if (/^(?:普通套餐)?不支持/u.test(value ?? '')) return false;
  if (/^支持|^提供.+订阅入口/u.test(value ?? '')) return true;
  return null;
};

const trialSupport = (value?: string): RecordedCondition => {
  if (/不支持.*试用|^不支持$/u.test(value ?? '')) return false;
  if (/^支持|(?:新用户|新注册用户).{0,12}免费试用/u.test(value ?? '')) return true;
  return null;
};

const accessMode = (subscription: RecordedCondition, hasOfficialClient: boolean): AccessMode => {
  if (subscription === true) return hasOfficialClient ? 'both' : 'subscription';
  if (subscription === false && hasOfficialClient) return 'official';
  return null;
};

const navigationAirports: NavigationAirport[] = [
  ...airports.map((airport): NavigationAirport => {
    const clientNotes = [airport.testClient, ...(airport.platforms ?? []), airport.universalSubscription].join('；');
    const hasOfficialClient = /官方|自研|专属客户端|官网提供.+客户端/u.test([airport.testClient, ...(airport.platforms ?? [])].join('；'));
    return {
      slug: airport.slug,
      name: airport.name,
      kind: 'tested',
      price: `${airport.entryPlan.price}，${airport.entryPlan.traffic}`,
      reviewedAt: airport.commercialReviewedAt,
      accessMode: accessMode(airport.officialClientOnly ? false : subscriptionSupport(airport.universalSubscription), hasOfficialClient),
      noExpiry: recordedSupport(airport.noExpiry),
      trial: trialSupport(airport.trial),
      clientNotes,
    };
  }),
  ...airportProfiles.filter((profile) => profile.status === 'reference').map((profile): NavigationAirport => ({
    slug: profile.slug,
    name: profile.name,
    kind: 'reference',
    price: profile.priceSummary ?? '价格待核对',
    reviewedAt: profile.sourceReviewedAt,
    accessMode: accessMode(subscriptionSupport(profile.universalSubscription), /专属客户端/u.test(profile.client ?? '')),
    noExpiry: recordedSupport(profile.noExpiry),
    trial: trialSupport(profile.trial),
    clientNotes: [profile.client, ...profile.highlights, ...profile.clientTables.flatMap((table) => table.rows.flat())].join('；'),
  })),
].sort((left, right) => left.slug.localeCompare(right.slug));

const accessLabels = {
  subscription: '通用订阅',
  official: '官网指定客户端',
  both: '通用订阅与官方客户端',
} as const;

const conditionSummary = (airport: NavigationAirport) => [
  ...(airport.accessMode ? [accessLabels[airport.accessMode]] : []),
  ...(airport.noExpiry === true ? ['有不限时总流量包'] : airport.noExpiry === false ? ['不支持不限时包'] : []),
  ...(airport.trial === true ? ['有免费试用资料'] : airport.trial === false ? ['不支持免费试用'] : []),
].join(' · ');

export const getRelatedAirports = (slug: string) => {
  const sourceIndex = navigationAirports.findIndex((airport) => airport.slug === slug);
  const source = navigationAirports[sourceIndex];
  if (!source?.accessMode) return [];
  const sourceAccessMode = source.accessMode;

  return navigationAirports.flatMap((candidate, candidateIndex) => {
    if (candidate.slug === slug || candidate.accessMode !== sourceAccessMode) return [];
    const sameNoExpiry = source.noExpiry !== null && candidate.noExpiry === source.noExpiry;
    const sameTrial = source.trial === true && candidate.trial === true;
    // A shared access method alone is too broad to justify a related-service link.
    if (!sameNoExpiry && !sameTrial) return [];
    const shared = [`同为${accessLabels[sourceAccessMode]}`];
    if (sameNoExpiry) shared.push(source.noExpiry ? '均有不限时包资料' : '均标记不支持不限时包');
    if (sameTrial) shared.push('均有免费试用资料');
    return [{
      slug: candidate.slug,
      name: candidate.name,
      kind: candidate.kind,
      price: candidate.price,
      reviewedAt: candidate.reviewedAt,
      conditions: conditionSummary(candidate),
      shared: shared.join('；'),
      relevance: Number(sameNoExpiry) * 2 + Number(sameTrial),
      // Rotate only equal matches so every page need not point to the same first three entries.
      tieOrder: (candidateIndex - sourceIndex + navigationAirports.length) % navigationAirports.length,
    }];
  }).sort((left, right) => right.relevance - left.relevance || left.tieOrder - right.tieOrder).slice(0, 3);
};

export const getAirportTutorials = (slug: string): { links: AirportTutorialLink[]; note: string } => {
  const source = navigationAirports.find((airport) => airport.slug === slug);
  if (!source?.accessMode) return { links: [], note: '' };
  if (source.accessMode === 'official') return {
    links: [{ href: '/tutorial/#subscription-troubleshooting', label: '连接前检查套餐与入口' }],
    note: '这家资料标记不支持通用订阅；请使用官网指定客户端，并按官网文档排查。下方排查入口仅供检查套餐和地址，不适用 Clash 或 Shadowrocket 导入步骤。',
  };

  const links: AirportTutorialLink[] = [];
  if (/Clash|Mihomo/iu.test(source.clientNotes)) links.push({ href: '/tutorial/#clash-subscription', label: 'Clash 订阅导入步骤' });
  if (/Shadowrocket/iu.test(source.clientNotes)) links.push({ href: '/tutorial/#shadowrocket-subscription', label: 'Shadowrocket 订阅导入步骤' });
  if (links.length < 2) links.push({ href: '/tutorial/#subscription-troubleshooting', label: '订阅链接失效排查' });
  return {
    links: links.slice(0, 2),
    note: '以下是通用订阅操作参考。先在官网确认客户端版本、订阅格式和领取方式，再按对应客户端步骤操作。',
  };
};
