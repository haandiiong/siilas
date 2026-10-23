import type { APIRoute } from 'astro';
import { archiveIndex } from '../../data/test-archive';

export const prerender = true;
export const GET: APIRoute = () => new Response(JSON.stringify(archiveIndex), {
	headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
