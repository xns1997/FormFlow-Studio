/**
 * AG Grid Server-Side Datasource Adapter
 *
 * Bridges AG Grid's IServerSideDatasource interface with the
 * FormFlow data preview API, enabling virtual scrolling and
 * on-demand data loading for large datasets.
 */
import type { IServerSideDatasource, IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import { dataPreviewApi, type PreviewQuery } from './dataPreviewClient';
import type { FilterRule } from '../../../../shared/formflow-core/previewFilter';

export interface ServerSideDatasourceOptions {
  projectId: string;
  tableId: string;
  sheetName: string;
  getSearch: () => string;
  getKeySearch: () => string;
  onError?: (message: string) => void;
  onDataLoaded?: (totalRows: number) => void;
}

/**
 * Creates an AG Grid Server-Side Datasource that fetches data
 * on-demand as the user scrolls.
 */
export function createServerSideDatasource(options: ServerSideDatasourceOptions): IServerSideDatasource {
  const { projectId, tableId, sheetName, getSearch, getKeySearch, onError, onDataLoaded } = options;
  let abortController: AbortController | null = null;

  return {
    getRows(params: IServerSideGetRowsParams) {
      // Cancel any in-flight request
      if (abortController) abortController.abort();
      abortController = new AbortController();

      const request: IServerSideGetRowsRequest = params.request;

      // Build filter model from AG Grid's request
      const filterModel: Record<string, FilterRule> = {};
      if (request.filterModel) {
        for (const [key, filter] of Object.entries(request.filterModel)) {
          filterModel[key] = filter as FilterRule;
        }
      }

      // Build sort model
      const sortModel = (request.sortModel || []).map((s) => ({
        colId: s.colId,
        sort: s.sort as 'asc' | 'desc',
      }));

      // Calculate page from startRow/endRow
      const startRow = request.startRow || 0;
      const endRow = request.endRow || 500;
      const pageSize = endRow - startRow;
      const page = Math.floor(startRow / pageSize) + 1;

      const query: PreviewQuery = {
        page,
        pageSize,
        search: getSearch(),
        keySearch: getKeySearch(),
        sortModel,
        filterModel,
      };

      dataPreviewApi
        .page({ projectId, tableId, sheetName, ...query })
        .then((result) => {
          if (abortController?.signal.aborted) return;

          const rows = result.rows || [];
          const total = result.total ?? rows.length;

          // Add row index for AG Grid
          const rowsWithIndex = rows.map((row, i) => ({
            ...row,
            __rowIndex: startRow + i,
          }));

          params.success({
            rowData: rowsWithIndex,
            rowCount: total,
          });

          onDataLoaded?.(total);
        })
        .catch((err) => {
          if (abortController?.signal.aborted) return;
          params.fail();
          onError?.(`数据加载失败: ${err instanceof Error ? err.message : String(err)}`);
        });
    },

    destroy() {
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    },
  };
}

/**
 * Refreshes the server-side datasource by purging the cache
 * and requesting a fresh load.
 */
export function refreshServerSideDatasource(api: { refreshServerSide: (params?: { purge?: boolean }) => void }) {
  api.refreshServerSide({ purge: true });
}
