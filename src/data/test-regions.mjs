export const TEST_REGIONS = Object.freeze(['新加坡', '香港', '日本', '美国']);

const aliases = new Map([
	['sg', '新加坡'], ['singapore', '新加坡'],
	['hk', '香港'], ['hong kong', '香港'], ['中国香港', '香港'],
	['jp', '日本'], ['japan', '日本'],
	['us', '美国'], ['usa', '美国'], ['united states', '美国'], ['united states of america', '美国'],
]);

/** Only the recorded exit-IP region is authoritative; node, ISP and server labels are not substitutes. */
export const getTestRegion = (test) => {
	const region = typeof test.exitRegion === 'string' ? test.exitRegion.trim() : '';
	return region ? aliases.get(region.toLowerCase()) ?? region : null;
};

/** Scoring and four-region coverage exclude unknown exits and regions outside the comparison. */
export const getCoreTestRegion = (test) => {
	const region = getTestRegion(test);
	return TEST_REGIONS.includes(region) ? region : null;
};

/** Describe every recorded exit region, including regions outside the four-region score. */
export const getTestRegions = (tests) => {
	const regions = [...new Set(tests.map(getTestRegion).filter((region) => region !== null))];
	return [
		...TEST_REGIONS.filter((region) => regions.includes(region)),
		...regions.filter((region) => !TEST_REGIONS.includes(region)).sort(),
	];
};
