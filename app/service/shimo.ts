import { Service } from 'egg';
import * as request from 'request';
import { TableConfig, defaultColumnType, PreTableConfig, RowData, SheetData, TableData } from '../schema/table';

export default class ShimoService extends Service {

  private baseUrl = 'https://api.shimo.im';
  private rowBatch = 20;
  private token: string;

  public async update() {
    const { logger } = this;
    const { config } = this.ctx.app;
    const tables: TableConfig[] = config.shimo.tables;
    const updateFunc = async (path: string, data: any) => {
      logger.info(`Start to update ${path}`);
      await this.ctx.service.github.updateRepo(path, data);
      await this.ctx.service.gitee.updateRepo(path, data);
    };
    const indexFiles = {};
    for (const table of tables) {
      if (!indexFiles[table.indexKey]) {
        indexFiles[table.indexKey] = [];
      }
      const tableData = await this.getTableData(table);
      try {
        for (const sheetData of tableData.data) {
          const data = await this.ctx.service.dataFormat.format(sheetData.data, table);
          const filePath = table.getFilePath(sheetData.sheetName);
          if (data.length > 0) {
            // only update if have data
            await updateFunc(`data/json/${filePath}`, JSON.stringify(data));
            if (table.feParser) {
              await updateFunc(`data/fe/${filePath}`, JSON.stringify(table.feParser(data, sheetData.sheetName)));
            }
          }
          indexFiles[table.indexKey].push(filePath);
        }
      } catch (e) {
        logger.error(e);
      }
    }
    await this.ctx.service.github.updateRepo('data/index.json', JSON.stringify(indexFiles));
  }

  private async getToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      const config = this.ctx.app.config.shimo;
      const options = {
        method: 'POST',
        url: `${this.baseUrl}/oauth/token`,
        headers: {
          authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        form: {
          grant_type: 'password',
          username: config.username,
          password: config.password,
          scope: 'read',
        },
      };
      request(options, (err: any, _: any, body: string) => {
        if (err) {
          reject(err);
        }
        try {
          const data = JSON.parse(body);
          if (!data.access_token) {
            reject(new Error('Get access token error, body =' + body));
          }
          resolve(data.access_token);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async getTableData(table: PreTableConfig): Promise<TableData> {

    const { logger } = this.ctx;

    const tableData: TableData = {
      guid: table.guid,
      data: [],
    };
    let preTableData: TableData | null = null;

    if (table.preTable) {
      // get pre table data if exists and flatten
      preTableData = await this.getTableData(table.preTable);
    }

    for (const sheet of table.sheets) {
      try {
        const sheetData = await this.getSheetContent(table, sheet);
        tableData.data.push(sheetData);
      } catch (e) {
        logger.error(e);
      }
    }

    if (table.preTableDetect !== undefined && preTableData) {
      const preDataArray: RowData[] = [];
      preTableData.data.forEach(sheet => {
        preDataArray.push(...sheet.data);
      });
      let hitSheet = false;
      tableData.data.forEach(sheet => {
        if (hitSheet) return;
        sheet.data.forEach((row, rowIndex, sheet) => {
          // replace with pre table data
          if (table.preTableDetect !== undefined) {
            const pre = preDataArray.find(r => {
              if (table.preTableDetect) {
                const preItem = table.preTableDetect(r);
                const myItem = table.preTableDetect(row);
                if (!preItem || !myItem) return false;
                return preItem.value === myItem.value;
              }
              return false;
            });
            if (pre) {
              logger.info(`Gonna merge: ${table.preTableDetect(row).value}`);
              sheet[rowIndex] = pre;
              preDataArray.splice(preDataArray.indexOf(pre), 1);
              hitSheet = true;
            }
          }
        });
        if (hitSheet) {
          sheet.data.push(...preDataArray);
        }
      });
    }

    return tableData;
  }

  private async getSheetContent(tableConfig: PreTableConfig, sheetName: string): Promise<SheetData> {

    if (!this.token) {
      this.token = await this.getToken();
    }

    let range = '';
    let row = tableConfig.skipRows + 1;
    const minCol = this.getColumnName(tableConfig.skipColumns + 1);
    const maxCol = tableConfig.maxColumn;
    let done = false;

    const names = (await this.getFileContentRange(this.token, tableConfig.guid,
      `${sheetName}!${minCol}${tableConfig.nameRow}:${maxCol}${tableConfig.nameRow}`))[0];
    const types = (await this.getFileContentRange(this.token, tableConfig.guid,
      `${sheetName}!${minCol}${tableConfig.typeRow}:${maxCol}${tableConfig.typeRow}`))[0];
    const defaultValues = (await this.getFileContentRange(this.token, tableConfig.guid,
      `${sheetName}!${minCol}${tableConfig.defaultValueRow}:${maxCol}${tableConfig.defaultValueRow}`))[0];
    const res: SheetData = {
      sheetName,
      data: [],
    };
    while (!done) {
      range = `${sheetName}!${minCol}${row}:${maxCol}${row + this.rowBatch}`;
      row += this.rowBatch + 1;
      const values = await this.getFileContentRange(this.token, tableConfig.guid, range);
      for (const row of values) {
        if (!row.some(v => v !== null)) {
          // blank row, all data get done
          done = true;
          break;
        }
        const rowData: RowData = [];
        row.forEach((v, i) => {
          rowData.push({
            key: names[i],
            value: v !== null ? v : defaultValues[i],
            type: types[i] ?? defaultColumnType,
          });
        });
        res.data.push(rowData);
      }
    }
    return res;
  }

  private getColumnName(num: number): string {
    const numToChar = (n: number): string => {
      n = Math.floor(n % 26);
      if (n === 0) {
        return '';
      }
      return String.fromCharCode(n + 64);
    };
    return numToChar(num / 26) + numToChar(num); // 1 -> A, 2 -> B support 26*26
  }

  private async getFileContentRange(accessToken: string, guid: string, range: string): Promise<any[][]> {
    return new Promise((resolve, reject) => {
      const options = {
        method: 'GET',
        url: `${this.baseUrl}/files/${guid}/sheets/values`,
        qs: {
          range,
        },
        headers: {
          Authorization: `bearer ${accessToken}`,
        },
      };
      request(options, (err: any, _: any, body: string) => {
        if (err) {
          reject(err);
        }
        try {
          const data = JSON.parse(body);
          if (!data.values) {
            reject(new Error('Get values error, body =' + body));
          }
          resolve(data.values);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

}
