import { generateJobType } from '@/lib/utils/jobType';

console.log('--- Testing DMZ job types ---');

// 1. Single DMZ product
const singleDMZ = [
  { name: 'AR09B9170HZT', qty: 24, division: 'DMZ' }
];
console.log('Single DMZ:', generateJobType(singleDMZ));

// 2. DMZ + CDZ (>150 글로벌식기) mixed (like CAAU8587188 with 7 models)
const multiDMZ = [
  { name: 'M1', qty: 10, division: 'DMZ' },
  { name: 'M2', qty: 10, division: 'DMZ' },
  { name: 'M3', qty: 10, division: 'DMZ' },
  { name: 'M4', qty: 10, division: 'CDZ' },
  { name: 'M5', qty: 60, division: 'CDZ' },
  { name: 'M6', qty: 50, division: 'CDZ' },
  { name: 'M7', qty: 47, division: 'CDZ' }
];
console.log('Multi-model DMZ + CDZ:', generateJobType(multiDMZ));
