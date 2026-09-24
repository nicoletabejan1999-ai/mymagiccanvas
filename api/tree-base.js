function blobAuth() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) {
    return {
      oidcToken: process.env.VERCEL_OIDC_TOKEN,
      storeId: process.env.BLOB_STORE_ID
    };
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end();
  }

  const auth = blobAuth();
  if (!auth) {
    res.statusCode = 503;
    return res.end('Tree asset unavailable');
  }

  try {
    const { get } = await import('@vercel/blob');
    const result = await get('tree-base.png', {
      access: 'private',
      useCache: true,
      ...auth
    });

    if (!result || result.statusCode !== 200) {
      res.statusCode = 404;
      return res.end('Tree asset not found');
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

    if (req.method === 'HEAD') {
      res.statusCode = 200;
      return res.end();
    }

    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    res.statusCode = 200;
    return res.end(bytes);
  } catch (error) {
    console.error('Tree asset failed', error && error.message);
    res.statusCode = 500;
    return res.end('Tree asset unavailable');
  }
};
