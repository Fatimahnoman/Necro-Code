/**
 * Tiny deterministic in-memory SQL engine for the offline browser sandbox.
 * It implements the statements the ritual chamber advertises: CREATE TABLE,
 * INSERT, UPDATE, DELETE and SELECT (plus WHERE / ORDER BY). Every row printed
 * by the terminal comes from an actual mutation of an in-memory table — no
 * canned or guessed output.
 */

export type SqlValue = string | number | boolean | null;

export interface SqlQueryResult {
  columns: string[];
  rows: string[][];
  message?: string;
}

export interface SqlFailure {
  error: string;
}

export type SqlLocalResult = SqlQueryResult | SqlFailure;

interface Table {
  columns: string[];
  rows: Array<Record<string, SqlValue>>;
}

function isFailure(result: SqlLocalResult): result is SqlFailure {
  return typeof (result as SqlFailure).error === "string";
}

/** Split on a delimiter without breaking quoted strings or nested parens. */
function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      current += char;
      if (char === quote) {
        if (input[i + 1] === quote) {
          current += input[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`" || char === "[") {
      quote = char === "[" ? "]" : char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (depth === 0 && input.startsWith(delimiter, i)) {
      parts.push(current.trim());
      current = "";
      i += delimiter.length - 1;
      continue;
    }
    current += char;
  }

  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

/** Split top-level `AND` keywords in a WHERE clause. */
function splitAnd(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote) {
      current += char;
      if (char === quote) {
        if (input[i + 1] === quote) {
          current += input[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (depth === 0 && /^and\b/i.test(input.slice(i))) {
      parts.push(current.trim());
      current = "";
      i += 2;
      continue;
    }
    current += char;
  }

  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

function stripComments(input: string): string {
  let output = "";
  let quote: string | null = null;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1];

    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) {
          output += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      output += char;
      i += 1;
      continue;
    }
    if (char === "-" && next === "-") {
      while (i < input.length && input[i] !== "\n") i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }

    output += char;
    i += 1;
  }

  return output;
}

function parseName(raw: string): string {
  const value = raw.trim();
  if (/^`[\s\S]*`$/.test(value)) return value.slice(1, -1).replace(/``/g, "`");
  if (/^\[[\s\S]*\]$/.test(value)) return value.slice(1, -1);
  if (/^"[\s\S]*"$/.test(value)) return value.slice(1, -1).replace(/""/g, '"');
  return value;
}

function parseLiteral(raw: string): SqlValue {
  const value = raw.trim();
  if (/^'([\s\S]*)'$/.test(value)) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (/^"([\s\S]*)"$/.test(value)) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  if (/^null$/i.test(value)) return null;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function cellText(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function readCell(
  row: Record<string, SqlValue>,
  expression: string,
): SqlValue {
  const name = parseName(expression).toLowerCase();
  const match = Object.keys(row).find((key) => key.toLowerCase() === name);
  return match ? row[match] : null;
}

function compareValues(left: SqlValue, right: SqlValue, operator: string): boolean {
  if (operator === "LIKE") {
    const leftText = cellText(left);
    const pattern = cellText(right)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    return new RegExp(`^${pattern}$`, "i").test(leftText);
  }

  if (left === null || right === null) {
    if (operator === "=") return left === right;
    if (operator === "!=" || operator === "<>") return left !== right;
    return false;
  }

  if (
    (typeof left === "number" || typeof left === "boolean") &&
    (typeof right === "number" || typeof right === "boolean")
  ) {
    const a = Number(left);
    const b = Number(right);
    if (operator === "=") return a === b;
    if (operator === "!=" || operator === "<>") return a !== b;
    if (operator === ">") return a > b;
    if (operator === "<") return a < b;
    if (operator === ">=") return a >= b;
    if (operator === "<=") return a <= b;
  }

  const a = cellText(left).toLowerCase();
  const b = cellText(right).toLowerCase();
  if (operator === "=") return a === b;
  if (operator === "!=" || operator === "<>") return a !== b;
  if (operator === ">") return a > b;
  if (operator === "<") return a < b;
  if (operator === ">=") return a >= b;
  if (operator === "<=") return a <= b;
  return false;
}

function matchesWhere(row: Record<string, SqlValue>, clause: string): boolean {
  return splitAnd(clause).every((condition) => {
    const operators = ["LIKE", ">=", "<=", "!=", "<>", "=", ">", "<"];
    for (const operator of operators) {
      const parts = splitTopLevel(condition, operator);
      if (parts.length === 2) {
        return compareValues(
          readCell(row, parts[0]),
          parseLiteral(parts[1]),
          operator,
        );
      }
    }
    throw new Error(`Unsupported WHERE condition: ${condition}`);
  });
}

function getTable(
  tables: Map<string, Table>,
  rawName: string,
): { name: string; table: Table } {
  const name = parseName(rawName).toLowerCase();
  const table = tables.get(name);
  if (!table) throw new Error(`Table not found: ${parseName(rawName)}`);
  return { name, table };
}

function executeStatement(
  statement: string,
  tables: Map<string, Table>,
): SqlQueryResult {
  const create = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.`"\[\]]+)\s*\(([\s\S]*)\)$/i.exec(
    statement,
  );
  if (create) {
    const name = parseName(create[1]).toLowerCase();
    if (tables.has(name)) return { columns: [], rows: [], message: "OK" };
    const columns = splitTopLevel(create[2], ",")
      .map((definition) => parseName(definition.split(/\s+/)[0]))
      .filter(Boolean);
    if (columns.length === 0) throw new Error("CREATE TABLE needs at least one column");
    tables.set(name, { columns, rows: [] });
    return { columns: [], rows: [], message: "OK" };
  }

  const insert = /^INSERT\s+INTO\s+([\w.`"\[\]]+)\s*(?:\(([^)]*)\))?\s*VALUES\s+([\s\S]+)$/i.exec(
    statement,
  );
  if (insert) {
    const { table } = getTable(tables, insert[1]);
    const columns = insert[2]
      ? splitTopLevel(insert[2], ",").map(parseName)
      : table.columns;
    const valueSets = splitTopLevel(insert[3], ",");
    let inserted = 0;

    for (const valueSet of valueSets) {
      const inner = valueSet.trim().replace(/^\(/, "").replace(/\)$/, "");
      const values = splitTopLevel(inner, ",").map(parseLiteral);
      if (values.length !== columns.length) {
        throw new Error(
          `INSERT has ${values.length} value(s) but ${columns.length} column(s)`,
        );
      }
      const row: Record<string, SqlValue> = {};
      columns.forEach((column, index) => {
        const canonical = table.columns.find(
          (candidate) => candidate.toLowerCase() === column.toLowerCase(),
        );
        if (!canonical) throw new Error(`Unknown column: ${column}`);
        row[canonical] = values[index];
      });
      table.rows.push(row);
      inserted += 1;
    }
    return {
      columns: [],
      rows: [],
      message: `INSERT ${inserted} row${inserted === 1 ? "" : "s"}`,
    };
  }

  const update = /^UPDATE\s+([\w.`"\[\]]+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i.exec(
    statement,
  );
  if (update) {
    const { table } = getTable(tables, update[1]);
    const assignments = splitTopLevel(update[2], ",").map((assignment) => {
      const pair = splitTopLevel(assignment, "=");
      if (pair.length !== 2) throw new Error(`Invalid SET assignment: ${assignment}`);
      const column = parseName(pair[0]);
      const canonical = table.columns.find(
        (candidate) => candidate.toLowerCase() === column.toLowerCase(),
      );
      if (!canonical) throw new Error(`Unknown column: ${column}`);
      return { column: canonical, value: parseLiteral(pair[1]) };
    });
    const where = update[3];
    let updated = 0;

    for (const row of table.rows) {
      if (where && !matchesWhere(row, where)) continue;
      for (const assignment of assignments) row[assignment.column] = assignment.value;
      updated += 1;
    }
    return {
      columns: [],
      rows: [],
      message: `UPDATE ${updated} row${updated === 1 ? "" : "s"}`,
    };
  }

  const remove = /^DELETE\s+FROM\s+([\w.`"\[\]]+)(?:\s+WHERE\s+([\s\S]+))?$/i.exec(
    statement,
  );
  if (remove) {
    const { table } = getTable(tables, remove[1]);
    const where = remove[2];
    const before = table.rows.length;
    const kept = where
      ? table.rows.filter((row) => !matchesWhere(row, where))
      : [];
    table.rows = where ? kept : [];
    const deleted = before - table.rows.length;
    return {
      columns: [],
      rows: [],
      message: `DELETE ${deleted} row${deleted === 1 ? "" : "s"}`,
    };
  }

  const select = /^SELECT\s+([\s\S]+?)\s+FROM\s+([\w.`"\[\]]+)([\s\S]*)$/i.exec(
    statement,
  );
  if (select) {
    const { table } = getTable(tables, select[2]);
    const rest = select[3].trim();
    const whereMatch = /^WHERE\s+([\s\S]+?)(?=ORDER\s+BY\s+|$)/i.exec(rest);
    const orderMatch = /(?:^|\s)ORDER\s+BY\s+([\s\S]+)$/i.exec(rest);
    const where = whereMatch?.[1].trim();
    const order = orderMatch?.[1].trim();

    const requested = select[1].trim() === "*"
      ? table.columns
      : splitTopLevel(select[1], ",").map(parseName);
    for (const column of requested) {
      if (!table.columns.some((candidate) => candidate.toLowerCase() === column.toLowerCase())) {
        throw new Error(`Unknown column: ${column}`);
      }
    }

    let rows = where
      ? table.rows.filter((row) => matchesWhere(row, where))
      : [...table.rows];

    if (order) {
      const [rawColumn, direction] = order.split(/\s+/);
      const column = parseName(rawColumn);
      const descending = /^desc$/i.test(direction ?? "");
      rows = [...rows].sort((a, b) => {
        const av = readCell(a, column);
        const bv = readCell(b, column);
        if (av === bv) return 0;
        if (av === null) return descending ? 1 : -1;
        if (bv === null) return descending ? -1 : 1;
        const result =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : cellText(av).localeCompare(cellText(bv));
        return descending ? -result : result;
      });
    }

    const canonical = requested.map(
      (column) =>
        table.columns.find(
          (candidate) => candidate.toLowerCase() === column.toLowerCase(),
        )!,
    );

    return {
      columns: canonical,
      rows: rows.map((row) => canonical.map((column) => cellText(row[column]))),
      message: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
    };
  }

  throw new Error(`Unsupported SQL statement: ${statement.slice(0, 80)}`);
}

export function executeLocalSql(input: string): SqlLocalResult {
  const tables = new Map<string, Table>();
  const statements = splitTopLevel(stripComments(input.replace(/\r\n?/g, "\n")), ";");
  if (statements.length === 0) {
    return { error: "SQL ERROR: no executable statement found" };
  }

  try {
    let last: SqlQueryResult = { columns: [], rows: [] };
    for (const statement of statements) {
      last = executeStatement(statement, tables);
    }
    return last;
  } catch (error) {
    return {
      error: `SQL ERROR: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function isSqlFailure(result: SqlLocalResult): result is SqlFailure {
  return isFailure(result);
}
