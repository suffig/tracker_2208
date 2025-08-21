// Test matches.js after fixing the function structure
console.log('Testing matches.js after fix...');
import('./matches.js').then(() => {
  console.log('matches.js OK after fix');
}).catch(e => {
  console.error('matches.js still has error:', e);
});