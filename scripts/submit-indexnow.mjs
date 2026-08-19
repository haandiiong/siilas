import { readFile } from 'node:fs/promises';

const host = 'siilas.com';
const origin = `https://${host}`;
const key = process.env.INDEXNOW_KEY;
const dryRun = process.argv.includes('--dry-run');
const requestedPaths = process.argv.slice(2).filter((argument) => argument !== '--dry-run');

if (!key || !/^[A-Za-z0-9-]{8,128}$/.test(key)) {
	throw new Error('INDEXNOW_KEY must contain 8–128 letters, numbers, or dashes.');
}

const airportData = JSON.parse(await readFile(new URL('../src/data/airports.json', import.meta.url), 'utf8'));
const defaultPaths = [
	'/',
	'/airport/',
	'/rank/',
	'/test/',
	'/methodology/',
	'/about/',
	'/tutorial/',
	'/disclosure/',
	'/privacy/',
	...airportData.map((airport) => `/airport/${airport.slug}/`),
];
const paths = requestedPaths.length ? requestedPaths : defaultPaths;
const urlList = [...new Set(paths.map((path) => new URL(path, origin).href))];
const payload = {
	host,
	key,
	keyLocation: `${origin}/${key}.txt`,
	urlList,
};

if (dryRun) {
	console.log(JSON.stringify(payload, null, 2));
	process.exit(0);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
	method: 'POST',
	headers: { 'content-type': 'application/json; charset=utf-8' },
	body: JSON.stringify(payload),
});

if (!response.ok) {
	const details = await response.text();
	throw new Error(`IndexNow returned ${response.status}: ${details || response.statusText}`);
}

console.log(`IndexNow accepted ${urlList.length} URLs with status ${response.status}.`);
