const fs = require('fs');

// A valid 32x32 blue square PNG
const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAzSURBVFhH7c2hAQAgEAOh+Tf9VAFN4GBwJrk7+b+vX3v48OHDhw8fPnz48OHDhw8fvn4H1gExH+5r2ckAAAAASUVORK5CYII=';

fs.writeFileSync('icon.png', Buffer.from(base64Data, 'base64'));
console.log('icon.png created successfully.');
