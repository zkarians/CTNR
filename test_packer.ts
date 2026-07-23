import { packContainer } from './src/lib/packer';
import { CONTAINER_DATA, Product } from './src/lib/types';

const container = CONTAINER_DATA['40hc'];
const products: Product[] = [
  { id: 'CBGJ3623D.BBDELNA', model_name: 'CBGJ3623D.BBDELNA', width: 1017, length: 660, height: 267, quantity: 30, allow_rotate: true, allow_lay_down: false },
  { id: 'CBGJ3623S.BSTELNA', model_name: 'CBGJ3623S.BSTELNA', width: 1017, length: 660, height: 267, quantity: 45, allow_rotate: true, allow_lay_down: false },
  { id: 'CBIH3013BE.BB1ELNA', model_name: 'CBIH3013BE.BB1ELNA', width: 863, length: 618, height: 138, quantity: 125, allow_rotate: true, allow_lay_down: false },
  { id: 'LSGU6339X.BRSELGA', model_name: 'LSGU6339X.BRSELGA', width: 830, length: 775, height: 1100, quantity: 50, allow_rotate: true, allow_lay_down: false },
  { id: 'WSEP4723F.BRSLLGA', model_name: 'WSEP4723F.BRSLLGA', width: 855, length: 775, height: 835, quantity: 2, allow_rotate: true, allow_lay_down: false }
];

const res = packContainer(container, products, 10);
console.log("Packed efficiency:", res.efficiency);
console.log("Unpacked list:");
console.log(res.unpacked);

let maxY = 0;
res.items.forEach(it => {
  const endY = it.y + it.l;
  if (endY > maxY) maxY = endY;
});
console.log("Max Y coordinate:", maxY);
console.log("Remaining container length:", container.length - maxY);

const lsgu = res.items.filter(it => it.product.id.includes('6339'));
console.log("LSGU6339X count packed:", lsgu.length);
