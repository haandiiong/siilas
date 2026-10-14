import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';
import type { Airport } from '../data/airport-data';
import type { AirportReview } from '../data/airport-review';

const escapeText = (value: string) => value.replace(/[&<>"']/gu, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]!);
const fontfile = join(process.cwd(), 'src/assets/fonts/siilas-review-subset.otf');
// Use the same bundled font in local development and Linux builds.
process.env.FONTCONFIG_FILE ??= join(process.cwd(), 'src/assets/fonts/siilas-review-fonts.conf');
const supportedCharacters = new Set(readFileSync(join(process.cwd(), 'src/assets/fonts/siilas-review-characters.txt'), 'utf8'));

/** A static share card of recorded historical medians, rather than a speed promise. */
export const renderAirportShareImage = async (airport: Airport, review: AirportReview) => {
  const blocks = review.regions.map((region, index) => {
    const left = 56 + index * 278;
    const maximum = Math.max(1, ...review.regions.map((item) => item.dailyMedianDownload ?? 0));
    const barWidth = ((region.dailyMedianDownload ?? 0) / maximum) * 216;
    return `<rect x="${left}" y="328" width="254" height="184" rx="15" fill="#0d1a17" stroke="#233631"/><rect x="${left + 19}" y="484" width="216" height="4" rx="2" fill="#233631"/><rect x="${left + 19}" y="484" width="${barWidth}" height="4" rx="2" fill="#55e7cf"/>`;
  }).join('');
  const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#07110f"/><rect x="0" y="0" width="1200" height="6" fill="#b9ff4b"/>${blocks}<line x1="56" y1="550" x2="1144" y2="550" stroke="#233631"/></svg>`);
  const composites: OverlayOptions[] = [];
  const text = async (value: string, left: number, top: number, size: number, color = '#edf7f3') => {
    const missing = [...value].filter((character) => !supportedCharacters.has(character));
    if (missing.length) throw new Error(`分享图字体缺少字符：${[...new Set(missing)].join('')}，请重新生成字体子集`);
    const input = await sharp({ text: {
      text: `<span foreground="${color}">${escapeText(value)}</span>`,
      font: `Siilas Review ${size}`, fontfile, rgba: true, dpi: 72,
    } }).png().toBuffer();
    composites.push({ input, left, top });
  };
  await text('SIILAS / VERIFIED RECORDS', 56, 40, 20, '#b9ff4b');
  await text(`${airport.name}机场实测`, 56, 102, 48);
  await text(`${review.verifiedCount} 条可核验测速 · ${review.dateCount} 个日期`, 56, 192, 25);
  await text(`样本周期 ${review.startDate ?? '待测试'} — ${review.endDate ?? '待测试'}`, 56, 242, 20, '#8fa9a1');
  await text('每日下载代表值的中位数', 56, 296, 18, '#8fa9a1');
  for (const [index, region] of review.regions.entries()) {
    const left = 75 + index * 278;
    await text(region.region, left, 352, 24);
    await text(region.dailyMedianDownload === null ? '待测试' : `${Number(region.dailyMedianDownload.toFixed(2))} Mbps`, left, 398, 30);
    await text(`最近测速 ${region.latest?.testedAt ?? '待测试'}`, left, 448, 16, '#8fa9a1');
  }
  await text('历史数据，非实时速度', 56, 574, 19, '#8fa9a1');
  await text(`siilas.com/airport/${airport.slug}/`, 660, 576, 16, '#8fa9a1');
  return sharp(background).composite(composites).png().toBuffer();
};
