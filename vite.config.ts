import { defineConfig, ViteDevServer, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import https from 'https';
import fs from 'fs';
import path from 'path';

const middlewarePlugin = (env: Record<string, string>) => ({
  name: 'login-middleware',
  configureServer(server: ViteDevServer) {
    console.log('[Login Middleware] Plugin registered');
    server.middlewares.use((req, res, next) => {
      const isMainAppRequest = req.url?.startsWith('/secure/') &&
        !req.url?.startsWith('/secure/login') &&
        !req.url?.startsWith('/secure/login/');
      
      const isApiRequest = req.url?.startsWith('/api/');

      const cleanHeaders = Object.fromEntries(
        Object.entries(req.headers).filter(([key]) =>
          !key.startsWith(':') && key.toLowerCase() !== 'connection'
        )
      );

      // Handle API requests - proxy to configurable target
      // When mocks are enabled, API calls don't reach this middleware
      if (isApiRequest) {
        const apiPath = req.url?.replace('/api', '') || '/';

        // Get proxy target from env, default to AWS
        const proxyTarget = env.VITE_API_PROXY_TARGET || 'https://dev.portal.appc.api.openlogx.com';
        const targetUrl = new URL(proxyTarget);

        // Derive origin by removing 'api.' from hostname (e.g., dev.portal.neutranarc.api.openlogx.com -> dev.portal.neutranarc.openlogx.com)
        const originHost = targetUrl.hostname.replace('api.', '');

        console.log(`[Login Middleware] 🚀 Intercepted ${req.method} ${req.url}`);
        console.log(`[Login Middleware] 📡 Forwarding to: ${proxyTarget}${apiPath}`);

        const proxyReq = https.request(
          {
            hostname: targetUrl.hostname,
            port: targetUrl.port || 443,
            path: apiPath,
            method: req.method,
            headers: {
              ...cleanHeaders,
              'host': targetUrl.host,
              'origin': `${targetUrl.protocol}//${originHost}`,
              // AWS API Gateway context headers for local backend testing
              'AWS_ACCOUNT_ID': env.VITE_AWS_ACCOUNT_ID || 'undefined',
              'AWS_REGION': env.VITE_AWS_REGION || 'undefined',
              'AWS_PARTITION': env.VITE_AWS_PARTITION || 'undefined'
            },
            rejectUnauthorized: false
          },
          proxyRes => {
            console.log(`[Login Middleware] ✅ Response ${proxyRes.statusCode} for ${apiPath}`);

            // For errors, buffer and log the response
            if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
              let body = '';
              proxyRes.on('data', chunk => body += chunk);
              proxyRes.on('end', () => {
                console.error(`[Login Middleware] ❌ Error ${proxyRes.statusCode} body:`, body.substring(0, 500));

                // Clean HTTP/1-specific headers that are forbidden in HTTP/2
                const responseHeaders = { ...proxyRes.headers };
                delete responseHeaders['transfer-encoding'];
                delete responseHeaders['connection'];
                delete responseHeaders['keep-alive'];
                delete responseHeaders['upgrade'];

                res.writeHead(proxyRes.statusCode || 500, responseHeaders);
                res.end(body);
              });
            } else {
              // Clean HTTP/1-specific headers that are forbidden in HTTP/2
              const responseHeaders = { ...proxyRes.headers };
              delete responseHeaders['transfer-encoding'];
              delete responseHeaders['connection'];
              delete responseHeaders['keep-alive'];
              delete responseHeaders['upgrade'];

              res.writeHead(proxyRes.statusCode || 500, responseHeaders);
              proxyRes.pipe(res, { end: true });
            }
          }
        );

        proxyReq.on('error', (err) => {
          console.error('[Login Middleware] API Proxy error:', err);
          res.writeHead(502);
          res.end('API Proxy error');
        });

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          req.pipe(proxyReq, { end: true });
        } else {
          proxyReq.end();
        }
        return;
      }

      // Proxy any request under /secure/ except /secure/login
      if (isMainAppRequest) {
        const proxyReq = https.request(
          {
            hostname: 'local.openlogx.com',
            port: 5161,
            path: req.url,
            method: req.method,
            headers: cleanHeaders,
            rejectUnauthorized: false
          },
          proxyRes => {
            const headers = { ...proxyRes.headers };
            delete headers['transfer-encoding'];
            res.writeHead(proxyRes.statusCode || 500, headers);
            proxyRes.pipe(res, { end: true });
          }
        );

        proxyReq.on('error', (err) => {
          console.error('[Middleware] Proxy error:', err);
          res.writeHead(502);
          res.end('Proxy error');
        });

        req.pipe(proxyReq, { end: true });
        return;
      }
      next();
    });
  }
});

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');

  return (mode !== 'development') ?
  {
    root: '.',
    publicDir: 'public',
    plugins: [
      middlewarePlugin(env),
      viteStaticCopy({
        targets: [
          //uses build-all.sh to move the static html files over
        ]
      })
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true
    },
    resolve: {
      alias: {
        '@': '/src',
        '@components': '/src/components',
        '@utils': '/src/utils',
        '@types': '/src/types'
      }
    },
    define: {
      'import.meta.env.DEV': mode === 'development'
    }
  }
  :
  {
    root: '.',
    publicDir: 'public',
    plugins: [
      middlewarePlugin(env),
      viteStaticCopy({
        targets: [
          //uses build-all.sh to move the static html files over
        ]
      })
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true
    },
    resolve: {
      alias: {
        '@': '/src',
        '@components': '/src/components',
        '@utils': '/src/utils',
        '@types': '/src/types'
      }
    },
    server: {
      host: 'local.openlogx.com',
      port: 5160,
      open: false,
      http2: false,
      https: {
        key: fs.readFileSync('/Users/dermotpope/Development/OpenLogx/ssl-certs/localhost-key.pem'),
        cert: fs.readFileSync('/Users/dermotpope/Development/OpenLogx/ssl-certs/localhost-cert.pem')
      }
    },
    define: {
      'import.meta.env.DEV': mode === 'development'
    }
  };
});