import type { APIRoute } from 'astro';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { airports } from '../../../data/airport-data';
import { getAirportReview } from '../../../data/airport-review';

export const prerender = true;
export const getStaticPaths = () => airports.flatMap((airport) => getAirportReview(airport).evidence.map((evidence) => ({
  params: { airport: airport.slug, record: evidence.test.id },
  props: { imagePath: evidence.imagePath },
})));
export const GET: APIRoute = async ({ props }) => {
  const publicRoot = resolve(process.cwd(), 'public');
  const imagePath = resolve(publicRoot, String(props.imagePath).replace(/^\/+/, ''));
  if (!imagePath.startsWith(`${publicRoot}${sep}`)) throw new Error('证据图片路径不在 public 目录内');
  const image = await sharp(imagePath).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp' } });
};
