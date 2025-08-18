/**
 * Image proxy endpoint for caching external images
 * Caches IGDB and other external images using Redis for better performance and persistence
 */

import { error } from '@sveltejs/kit';
import { createHash } from 'crypto';
import cache from '$lib/cache.js';

const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds (for Redis TTL)

export async function GET({ url, setHeaders }) {
  const imageUrl = url.searchParams.get('url');
  
  if (!imageUrl) {
    throw error(400, 'Missing image URL parameter');
  }

  // Validate that it's from allowed domains
  const allowedDomains = [
    'images.igdb.com',
    'media.rawg.io', 
    'steamcdn-a.akamaihd.net'
  ];
  
  const urlObj = new URL(imageUrl);
  if (!allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
    throw error(403, 'Domain not allowed for proxying');
  }

  // Create cache key from image URL hash
  const cacheKey = `img:${createHash('md5').update(imageUrl).digest('hex')}`;
  
  // Check Redis cache first
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      const imageData = JSON.parse(cached);
      
      setHeaders({
        'Content-Type': imageData.contentType,
        'Cache-Control': 'public, max-age=604800, immutable', // 7 days
        'X-Image-Cache': 'redis-hit'
      });
      
      // Convert base64 back to buffer
      const buffer = Buffer.from(imageData.data, 'base64');
      
      return new Response(buffer, {
        headers: {
          'Content-Type': imageData.contentType,
          'Cache-Control': 'public, max-age=604800, immutable',
          'X-Image-Cache': 'redis-hit'
        }
      });
    }
  } catch (cacheError) {
    console.warn('Redis cache read failed:', cacheError.message);
    // Continue to fetch from source
  }

  try {
    // Fetch the image from the original source
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'GGRequestz/1.0 (Image Proxy)'
      }
    });

    if (!response.ok) {
      throw error(response.status, `Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const data = await response.arrayBuffer();

    // Cache the image in Redis
    try {
      const imageData = {
        data: Buffer.from(data).toString('base64'),
        contentType,
        timestamp: Date.now()
      };
      
      await cache.set(cacheKey, JSON.stringify(imageData), CACHE_TTL);
    } catch (cacheError) {
      console.warn('Redis cache write failed:', cacheError.message);
      // Continue serving the image even if cache fails
    }

    setHeaders({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=604800, immutable', // 7 days
      'X-Image-Cache': 'redis-miss'
    });

    return new Response(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'X-Image-Cache': 'redis-miss'
      }
    });

  } catch (err) {
    console.error('Image proxy error:', err);
    throw error(500, 'Failed to proxy image');
  }
}