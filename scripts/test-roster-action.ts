import { getUpcoming3DaysRosterStatus } from '@/lib/actions/rosterActions';

async function main() {
    console.log('Testing CTNR rosterActions...');
    const res = await getUpcoming3DaysRosterStatus('2026-08-15');
    console.log('Result for 2026-08-15:\n', JSON.stringify(res, null, 2));

    const res2 = await getUpcoming3DaysRosterStatus('2026-08-14');
    console.log('Result for 2026-08-14:\n', JSON.stringify(res2, null, 2));
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
