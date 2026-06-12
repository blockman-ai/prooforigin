import crypto from "node:crypto";

export function createInMemoryVaultStateStore() {
  const events = [];
  let insertCount = 0;

  function compareValues(rowValue, filterValue, column) {
    if (column === "metadata->>view_session_id") {
      return rowValue?.view_session_id === filterValue;
    }
    return rowValue === filterValue;
  }

  function filterRows(rows, filters) {
    return rows.filter((row) =>
      Object.entries(filters).every(([column, value]) => {
        if (column === "metadata->>view_session_id") {
          return compareValues(row.metadata, value, column);
        }
        return compareValues(row[column], value, column);
      })
    );
  }

  function createQueryBuilder() {
    const query = {
      filters: {},
      order: null,
      limit: null,
      pendingInsert: null,
    };

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        query.filters[column] = value;
        return builder;
      },
      order(column, { ascending = true } = {}) {
        query.order = { column, ascending };
        return builder;
      },
      limit(count) {
        query.limit = count;
        return builder;
      },
      maybeSingle() {
        let rows = filterRows(events, query.filters);

        if (query.order) {
          const { column, ascending } = query.order;
          rows = [...rows].sort((left, right) => {
            const leftValue = left[column];
            const rightValue = right[column];
            if (leftValue === rightValue) return 0;
            if (leftValue < rightValue) return ascending ? -1 : 1;
            return ascending ? 1 : -1;
          });
        }

        if (query.limit != null) {
          rows = rows.slice(0, query.limit);
        }

        return Promise.resolve({
          data: rows[0] || null,
          error: null,
        });
      },
      insert(record) {
        insertCount += 1;
        const stored = {
          id: crypto.randomUUID(),
          ...record,
        };
        events.push(stored);
        query.pendingInsert = stored;

        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: query.pendingInsert, error: null });
              },
            };
          },
        };
      },
    };

    return builder;
  }

  return {
    client: {
      from() {
        return createQueryBuilder();
      },
    },
    events,
    get insertCount() {
      return insertCount;
    },
  };
}
