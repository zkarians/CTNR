const fs = require('fs');
let content = fs.readFileSync('src/components/HomeClient.tsx', 'utf8');

const regexStart = /let remark = cntr\.lastRemark \|\| '';\s*if \(remark\.startsWith\((['"`]).*?\1\)\) \{/g;

// Verify it exists
const match = regexStart.exec(content);
if (match) {
    // Replace just that specific declaration
    content = content.replace(/let remark = cntr\.lastRemark \|\| '';/, "let remark = cntr.remark || cntr.lastRemark || '';");
    fs.writeFileSync('src/components/HomeClient.tsx', content);
    console.log("Remark patch completed.");
} else {
    console.log("Target block not found.");
}
