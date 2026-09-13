import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateReceiptTax, receiptShipping, refundReceiptReduction } from '../src/lib/receipt-tax.server.ts';

const address = { recipient_name:'Test',line1:'1 Test St',city:'Boise',region:'ID',postal_code:'83702',country:'US' };
const input = { orderId:'order',checkoutId:'cs_test_original',paymentIntentId:'pi_original',
  originalTax:348,merchandise:4800,fee:799,shipping:1000,address };
const request = {...input,actualCostCents:4300,amountCents:212,finalTaxCents:336};
function mock() {
 const session={id:input.checkoutId,status:'complete',payment_status:'paid',payment_intent:'pi_original',
  invoice:'in_original',metadata:{parkvault_order_id:'order',parkvault_purpose:'sourcing'},currency:'usd',
  amount_total:7147,total_details:{amount_tax:348,amount_shipping:1000},livemode:false};
 const invoice={id:'in_original',status:'paid',currency:'usd',livemode:false,total:7147,amount_paid:7147,amount_remaining:0};
 const checkoutLines=['merchandise','platform_fee'].map((component,i)=>({quantity:1,amount_discount:0,
  amount_subtotal:i?799:5000,price:{id:`price_${i}`,tax_behavior:'exclusive',product:{metadata:{parkvault_component:component}}}}));
 const invoiceLines=[1,0].map(i=>({id:`il_${i}`,amount:i?799:5000,pricing:{price_details:{price:`price_${i}`}}}));
 const credits=[];const calls=[];
 const refund={id:'re_receipt',payment_intent:'pi_original',amount:212,status:'succeeded'};
 const note=(p)=>({id:'cn_receipt',invoice:p.invoice,livemode:false,currency:'usd',status:'issued',subtotal:200,
  total_excluding_tax:200,total:212,amount_shipping:0,pre_payment_amount:0,post_payment_amount:212,
  lines:{data:p.lines.map(l=>({...l})),has_more:false},metadata:p.metadata??{},refunds:[]});
 const stripe={checkout:{sessions:{retrieve:async()=>session,listLineItems:async()=>({data:checkoutLines,has_more:false})}},
  invoices:{retrieve:async()=>invoice,listLineItems:async()=>({data:invoiceLines,has_more:false})},
  creditNotes:{list:async()=>({data:credits,has_more:false}),preview:async(p)=>{calls.push(['preview',p]);return note(p);},
   create:async(p,options)=>{calls.push(['create',p,options]);const n={...note(p),refunds:[{refund:refund.id,amount_refunded:212}]};credits.push(n);return n;}},
  refunds:{list:async()=>({data:[],has_more:false}),retrieve:async()=>refund,create:async()=>{throw Error('Must not create a second refund');}}};
 return {stripe,session,invoice,checkoutLines,invoiceLines,credits,calls,refund};
}
test('invoice preview credits merchandise only and preserves exempt shipping',async()=>{
 const m=mock();const q=await calculateReceiptTax(m.stripe,input);
 assert.equal(q.taxCents,336);assert.match(q.calculationId,/credit_preview:in_original/);
 assert.deepEqual(m.calls[0][1].lines,[{type:'invoice_line_item',invoice_line_item:'il_0',amount:200}]);
});
test('credit creation produces one refund and retries reuse it after idempotency expiry',async()=>{
 const m=mock();assert.equal((await refundReceiptReduction(m.stripe,request)).id,'re_receipt');
 assert.equal((await refundReceiptReduction(m.stripe,request)).id,'re_receipt');
 const creates=m.calls.filter(c=>c[0]==='create');assert.equal(creates.length,1);
 assert.equal(creates[0][1].refund_amount,212);assert.equal(creates[0][2].idempotencyKey,'parkvault-receipt-credit-order-4300');
 m.refund.status='pending';await assert.rejects(refundReceiptReduction(m.stripe,request),/not completed/);
 m.refund.status='succeeded';m.refund.amount=200;await assert.rejects(refundReceiptReduction(m.stripe,request),/not completed/);
 assert.equal(m.calls.filter(c=>c[0]==='create').length,1);
});
test('lost creation response recovers from credit-note metadata without a second refund',async()=>{
 const m=mock();const create=m.stripe.creditNotes.create;
 m.stripe.creditNotes.create=async(...args)=>{await create(...args);throw Error('connection lost');};
 await assert.rejects(refundReceiptReduction(m.stripe,request),/connection lost/);
 assert.equal((await refundReceiptReduction(m.stripe,request)).id,'re_receipt');
 assert.equal(m.calls.filter(c=>c[0]==='create').length,1);
});
test('merchandise and platform fee reductions credit their own invoice lines',async()=>{
 const m=mock();const preview=m.stripe.creditNotes.preview;
 m.stripe.creditNotes.preview=async(p)=>({...await preview(p),subtotal:209,total_excluding_tax:209,total:222,post_payment_amount:222});
 const quote=await calculateReceiptTax(m.stripe,{...input,fee:790});assert.equal(quote.taxCents,335);
 assert.deepEqual(m.calls[0][1].lines,[
  {type:'invoice_line_item',invoice_line_item:'il_0',amount:200},
  {type:'invoice_line_item',invoice_line_item:'il_1',amount:9},
 ]);
});
test('unpaid, foreign, wrong-mode, legacy and unmappable invoices fail closed',async()=>{
 for(const change of [m=>m.session.metadata={},m=>m.session.payment_status='unpaid',m=>m.session.payment_intent='pi_other',
  m=>m.invoice.livemode=true,m=>m.session.invoice=null,m=>m.checkoutLines[0].price.product.metadata={},
  m=>m.invoice.total=7100,m=>m.invoiceLines[0].amount=800]) {
  const m=mock();change(m);await assert.rejects(calculateReceiptTax(m.stripe,input));
  assert.equal(m.calls.filter(c=>c[0]==='create').length,0);
 }
});
test('tax snapshot, tax allocation and wrong refund total cannot create credits',async()=>{
 await assert.rejects(calculateReceiptTax(mock().stripe,{...input,originalTax:390}));
 await assert.rejects(calculateReceiptTax(mock().stripe,{...input,originalTax:348.5}),/Invalid/);
 for(const override of [{amountCents:210},{finalTaxCents:338},{shipping:1100}]) {
  const m=mock();await assert.rejects(refundReceiptReduction(m.stripe,{...request,...override}));
  assert.equal(m.calls.filter(c=>c[0]==='create').length,0);
 }
});
test('prior unrelated credits, pagination and mismatched recorded credits need review',async()=>{
 const m=mock();m.credits.push({metadata:{}});await assert.rejects(refundReceiptReduction(m.stripe,request),/Existing/);
 const paged=mock();paged.stripe.creditNotes.list=async()=>({data:[],has_more:true});
 await assert.rejects(refundReceiptReduction(paged.stripe,request),/history/);
 const bad=mock();await refundReceiptReduction(bad.stripe,request);bad.credits[0].total=210;
 await assert.rejects(refundReceiptReduction(bad.stripe,request));assert.equal(bad.calls.filter(c=>c[0]==='create').length,1);
});
test('old untaxed orders retain metadata-idempotent refunds; taxed ones require reconciliation',async()=>{
 const m=mock();m.session.invoice=null;
 await assert.rejects(refundReceiptReduction(m.stripe,request),/older taxed order/);
 const refunds=[];let creates=0;
 const stripe={refunds:{list:async()=>({data:refunds,has_more:false}),create:async(p)=>{
  creates++;const r={id:'re_old',amount:p.amount,metadata:p.metadata,status:'succeeded'};refunds.push(r);return r;
 }}};
 const old={orderId:'old',actualCostCents:4300,paymentIntentId:'pi_old',amountCents:200};
 await refundReceiptReduction(stripe,old);await refundReceiptReduction(stripe,old);assert.equal(creates,1);
});
test('only sourcing checkout enables invoices; balance tax keeps original shipping',()=>{
 assert.throws(()=>receiptShipping({...address,postal_code:''}),/incomplete/);
 const code=readFileSync(new URL('../src/lib/stripe-marketplace.functions.ts',import.meta.url),'utf8');
 assert.match(code,/params.purpose === "sourcing" \? \{ invoice_creation: \{ enabled: true \} \}/);
 const balance=code.slice(code.indexOf('export const startSourcingBalanceCheckout'));
 assert.match(balance,/shipping: receiptShipping\(originalAddress\)/);assert.match(balance,/customer: taxCustomer.id/);
 assert.doesNotMatch(balance,/customer_update:.*shipping/);
});
