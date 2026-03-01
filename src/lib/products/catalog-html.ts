interface QueryError {
    message: string;
}

interface ProductRow {
    active_version_id: string | null;
}

interface VersionRow {
    generated_html: string | null;
}

interface QueryResult<T> {
    data: T[] | null;
    error: QueryError | null;
}

interface ProductsQuery {
    neq(column: string, value: string): ProductsQuery;
    limit(limit: number): PromiseLike<QueryResult<ProductRow>>;
}

interface VersionIdsQuery {
    limit(limit: number): PromiseLike<QueryResult<VersionRow>>;
}

interface CatalogDb {
    from(table: 'products' | 'product_versions'): {
        select(query: string): unknown;
    };
}

export async function loadCreatorCatalogHtml(
    db: CatalogDb,
    creatorId: string,
    options?: {
        excludeProductId?: string;
        limit?: number;
    }
): Promise<string[]> {
    const limit = options?.limit ?? 40;

    try {
        const productSelect = db.from('products').select('active_version_id') as {
            eq(column: string, value: string): {
                not(column: string, operator: string, value: null): ProductsQuery;
            };
        };

        let productsQuery = productSelect
            .eq('creator_id', creatorId)
            .not('active_version_id', 'is', null);

        if (options?.excludeProductId) {
            productsQuery = productsQuery.neq('id', options.excludeProductId);
        }

        const { data: products, error: productsError } = await productsQuery.limit(limit);

        if (productsError || !products || products.length === 0) {
            return [];
        }

        const versionIds = products
            .map((row: ProductRow) => row.active_version_id)
            .filter((id: string | null): id is string => typeof id === 'string' && id.length > 0)
            .slice(0, limit);

        if (versionIds.length === 0) return [];

        const versionSelect = db.from('product_versions').select('generated_html') as {
            in(column: string, values: string[]): VersionIdsQuery;
        };

        const { data: versions, error: versionsError } = await versionSelect
            .in('id', versionIds)
            .limit(limit);

        if (versionsError || !versions) {
            return [];
        }

        return versions
            .map((row: VersionRow) => row.generated_html)
            .filter((html: string | null): html is string => typeof html === 'string' && html.trim().length > 0);
    } catch {
        return [];
    }
}
