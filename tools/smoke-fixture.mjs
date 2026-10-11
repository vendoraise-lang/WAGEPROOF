// Test-only Stripe mock. Never use as a deployment entrypoint.
import { createApp } from '../server.js';
let metadata;
const server=createApp({env:{PUBLIC_BASE_URL:process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3101',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PRICE_ID:'price_fixture',APP_SECRET:'fixture-only-'.repeat(5)},stripeFetch:async(url,options)=>{
 if(url.includes('/prices/'))return Response.json({active:true,livemode:false,currency:'usd',unit_amount:900,type:'one_time'});
 if(url.includes('/charges?'))return Response.json({data:[{amount_refunded:0,disputed:false}]});
 if(options.method==='POST'){const p=new URLSearchParams(options.body);metadata={product:p.get('metadata[product]'),report_digest:p.get('metadata[report_digest]'),buyer_key_hash:p.get('metadata[buyer_key_hash]')};return Response.json({url:'https://checkout.stripe.com/c/pay/cs_test_browserfixture123456'});}
 return Response.json({mode:'payment',livemode:false,payment_status:'paid',status:'complete',amount_total:900,currency:'usd',payment_intent:'pi_fixture',metadata});
}});server.listen(3101,'127.0.0.1');
