/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['three'],
    allowedDevOrigins: ['ungdong.iptime.org', '192.168.10.213'],
    typescript: {
        ignoreBuildErrors: true,
    }
};

export default nextConfig;
