const fs = require('fs');
const file = 'src/lib/actions.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /WHERE work_date = \$1\r?\n\s+\)\r?\n\s+SELECT \* FROM Combined ORDER BY first_uploaded_at ASC\r?\n\s+`;\r?\n\r?\n\s+const res = await client\.query\(query, \[workDate\]\);/s;

const rep = 'WHERE work_date = $2\n                  )\n                  SELECT * FROM Combined ORDER BY first_uploaded_at ASC\n              `;\n\n              const res = await client.query(query, [workDate, workDate]);';

if (regex.test(code)) {
    code = code.replace(regex, rep);
    fs.writeFileSync(file, code);
    console.log('patched');
} else {
    console.log('not found');
}
