import {
  errorResponse,
  successResponse,
  cleanString,
  parsePositiveInteger,
  getPagination
} from "./utils.js";
import { getCurrentUser } from "./auth.js";

export async function getCategories(request, env) {
  const result = await env.DB.prepare(`
    SELECT
      id,
      name,
      slug,
      description,
      sort_order
    FROM categories
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `).all();

  return successResponse({
    categories: result.results || []
  });
}

export async function getProducts(request, env) {
  const url = new URL(request.url);
  const { limit, offset } = getPagination(url);
  const category = cleanString(url.searchParams.get("category"), 80);
  const search = cleanString(url.searchParams.get("search"), 100);
  const featured = url.searchParams.get("featured");

  const conditions = ["p.is_active = 1"];
  const bindings = [];

  if (category) {
    conditions.push("c.slug = ?");
    bindings.push(category);
  }

  if (search) {
    conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
    const keyword = `%${search}%`;
    bindings.push(keyword, keyword);
  }

  if (featured === "1" || featured === "true") {
    conditions.push("p.is_featured = 1");
  }

  const where = conditions.join(" AND ");

  const countResult = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
  `).bind(...bindings).first();

  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.category_id,
      p.name,
      p.slug,
      p.description,
      p.price,
      p.stock,
      p.image_url,
      p.is_featured,
      p.sort_order,
      c.name AS category_name,
      c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
    ORDER BY p.is_featured DESC, p.sort_order ASC, p.id DESC
    LIMIT ? OFFSET ?
  `).bind(...bindings, limit, offset).all();

  const products = (result.results || []).map(formatProduct);

  return successResponse({
    products,
    pagination: {
      limit,
      offset,
      total: Number(countResult?.total || 0),
      has_more: offset + products.length < Number(countResult?.total || 0)
    }
  });
}

export async function getProduct(request, env) {
  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");
  const slugParam = cleanString(url.searchParams.get("slug"), 120);

  if (!idParam && !slugParam) {
    return errorResponse("ID atau slug produk wajib diisi.", 400);
  }

  let product;

  if (idParam) {
    const id = parsePositiveInteger(idParam);

    if (!id) {
      return errorResponse("ID produk tidak valid.", 400);
    }

    product = await env.DB.prepare(`
      SELECT
        p.id,
        p.category_id,
        p.name,
        p.slug,
        p.description,
        p.price,
        p.stock,
        p.image_url,
        p.is_featured,
        p.sort_order,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? AND p.is_active = 1
      LIMIT 1
    `).bind(id).first();
  } else {
    product = await env.DB.prepare(`
      SELECT
        p.id,
        p.category_id,
        p.name,
        p.slug,
        p.description,
        p.price,
        p.stock,
        p.image_url,
        p.is_featured,
        p.sort_order,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.is_active = 1
      LIMIT 1
    `).bind(slugParam).first();
  }

  if (!product) {
    return errorResponse("Produk tidak ditemukan.", 404);
  }

  let isFavorite = false;

  try {
    const user = await getCurrentUser(request, env);

    if (user) {
      const favorite = await env.DB.prepare(`
        SELECT id
        FROM favorites
        WHERE user_id = ? AND product_id = ?
        LIMIT 1
      `).bind(user.id, product.id).first();

      isFavorite = !!favorite;
    }
  } catch {}

  return successResponse({
    product: {
      ...formatProduct(product),
      is_favorite: isFavorite
    }
  });
}

export async function getFavorites(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const { limit, offset } = getPagination(new URL(request.url));

  const countResult = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM favorites f
    INNER JOIN products p ON p.id = f.product_id
    WHERE f.user_id = ?
  `).bind(user.id).first();

  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.category_id,
      p.name,
      p.slug,
      p.description,
      p.price,
      p.stock,
      p.image_url,
      p.is_featured,
      p.sort_order,
      c.name AS category_name,
      c.slug AS category_slug,
      f.created_at AS favorited_at
    FROM favorites f
    INNER JOIN products p ON p.id = f.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT ? OFFSET ?
  `).bind(user.id, limit, offset).all();

  const products = (result.results || []).map(item => ({
    ...formatProduct(item),
    is_favorite: true,
    favorited_at: item.favorited_at
  }));

  const total = Number(countResult?.total || 0);

  return successResponse({
    products,
    pagination: {
      limit,
      offset,
      total,
      has_more: offset + products.length < total
    }
  });
}

export async function toggleFavorite(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return errorResponse("Login diperlukan.", 401);
  }

  const body = await request.json().catch(() => null);
  const productId = parsePositiveInteger(body?.product_id);

  if (!productId) {
    return errorResponse("product_id tidak valid.", 400);
  }

  const product = await env.DB.prepare(`
    SELECT id
    FROM products
    WHERE id = ? AND is_active = 1
    LIMIT 1
  `).bind(productId).first();

  if (!product) {
    return errorResponse("Produk tidak ditemukan.", 404);
  }

  const favorite = await env.DB.prepare(`
    SELECT id
    FROM favorites
    WHERE user_id = ? AND product_id = ?
    LIMIT 1
  `).bind(user.id, productId).first();

  if (favorite) {
    await env.DB.prepare(`
      DELETE FROM favorites
      WHERE id = ?
    `).bind(favorite.id).run();

    return successResponse({
      product_id: productId,
      is_favorite: false
    });
  }

  await env.DB.prepare(`
    INSERT INTO favorites (
      user_id,
      product_id
    )
    VALUES (?, ?)
  `).bind(user.id, productId).run();

  return successResponse({
    product_id: productId,
    is_favorite: true
  });
}

export async function checkFavorite(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user) {
    return successResponse({
      is_favorite: false
    });
  }

  const url = new URL(request.url);
  const productId = parsePositiveInteger(url.searchParams.get("product_id"));

  if (!productId) {
    return errorResponse("product_id tidak valid.", 400);
  }

  const favorite = await env.DB.prepare(`
    SELECT id
    FROM favorites
    WHERE user_id = ? AND product_id = ?
    LIMIT 1
  `).bind(user.id, productId).first();

  return successResponse({
    product_id: productId,
    is_favorite: !!favorite
  });
}

function formatProduct(product) {
  const stock = product.stock === null || product.stock === undefined
    ? null
    : Number(product.stock);

  return {
    id: Number(product.id),
    category_id: product.category_id === null ? null : Number(product.category_id),
    category_name: product.category_name || null,
    category_slug: product.category_slug || null,
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    price: Number(product.price || 0),
    stock,
    image_url: product.image_url || null,
    is_featured: Number(product.is_featured || 0) === 1,
    is_available: stock === null || stock > 0,
    sort_order: Number(product.sort_order || 0)
  };
}
