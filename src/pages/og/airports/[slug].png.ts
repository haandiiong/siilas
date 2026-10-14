import type { APIRoute } from 'astro';
import { airports } from '../../../data/airport-data';
import type { Airport } from '../../../data/airport-data';
import { getAirportReview } from '../../../data/airport-review';
import type { AirportReview } from '../../../data/airport-review';
import { renderAirportShareImage } from '../../../lib/airport-share-image';

export const prerender = true;
export const getStaticPaths = () => airports.map((airport) => ({
  params: { slug: airport.slug },
  props: { airport, review: getAirportReview(airport) },
}));
export const GET: APIRoute = async ({ props }) => {
  const image = await renderAirportShareImage(props.airport as Airport, props.review as AirportReview);
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png' } });
};
