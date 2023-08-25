const { Dbf } = require("dbf-reader");
const fs = require("fs");
const subMonths = require("date-fns/subMonths");

let buffer = fs.readFileSync("scripts/sample.dbf");

const data = [];

Dbf.read(buffer).rows.forEach((row) => {
  data.push({
    value: 1.0 / row.curs,
    date: subMonths(row.data.valueOf(), 1).valueOf(),
  });
});

fs.writeFileSync("src/data.json", JSON.stringify(data));
