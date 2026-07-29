export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { initRemoteSyncScheduler } = await import('./lib/remoteSyncScheduler');
        initRemoteSyncScheduler();
    }
}
