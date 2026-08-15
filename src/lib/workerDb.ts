import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let _workerPool: Pool | null = null;

const DEFAULT_WORKER_DB_URL = "postgresql://workeradmin:mGTofaX7GpnyJCYgwjlOkQ@alive-hobbit-22457.j77.aws-ap-southeast-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full";

export function getWorkerPool(): Pool {
    if (!_workerPool) {
        dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
        const connectionString = process.env.WORKER_DATABASE_URL || DEFAULT_WORKER_DB_URL;
        
        _workerPool = new Pool({
            connectionString,
            ssl: {
                rejectUnauthorized: false
            },
            connectionTimeoutMillis: 7000,
            idleTimeoutMillis: 30000,
            max: 10,
        });
    }
    return _workerPool;
}

export const workerPool = {
    query: (text: string, params?: any[]) => getWorkerPool().query(text, params),
    connect: () => getWorkerPool().connect(),
};
