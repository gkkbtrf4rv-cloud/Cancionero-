import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { verificationEmail, adminRequestEmail, approvedEmail, passwordResetEmail, testEmail } from '../lib/email.js';
import { institutionalEmail } from '../lib/email-template.js';
const url='https://cancionero-ten.vercel.app';
const examples=[verificationEmail({mote:'Marlon',email:'marlon@example.test',verifyUrl:url+'/api/verify-email?token=demo&x=1'}),adminRequestEmail({mote:'Marlon',email:'marlon@example.test',appUrl:url}),approvedEmail({mote:'Marlon',appUrl:url}),passwordResetEmail({mote:'Marlon',resetUrl:url+'/recuperar#token=demo'}),testEmail({from:'Cancionero Tuna <mail@example.test>',appUrl:url})];
test('all five email types are institutional HTML plus plaintext and embedded crest',()=>{
  for(const mail of examples){assert.ok(mail.subject&&mail.text);assert.match(mail.html,/TUNA DE DERECHO/);assert.match(mail.html,/Tradición · Música · Hermandad/);assert.match(mail.html,/role="presentation"/);assert.match(mail.html,/#4b1020/);assert.match(mail.html,/#c9a24b/);assert.match(mail.html,/cid:tuna-crest@cancionero/);assert.equal(mail.attachments[0].contentType,'image/png');assert.ok(mail.attachments[0].content.length);assert.match(mail.html,/Si el botón no funciona/);}
  assert.match(examples[0].html,/48 horas/);assert.match(examples[3].html,/30 minutos/);assert.match(examples[1].html,/pendiente/);
});
test('dynamic text is escaped, query and fragment tokens remain intact, unsafe links omitted',()=>{
  const mail=verificationEmail({mote:'<script>alert(1)</script>',email:'a&b@example.test',verifyUrl:url+'/?token=a&next=b'});
  assert.doesNotMatch(mail.html,/<script>/);assert.match(mail.html,/&lt;script&gt;/);assert.match(mail.html,/href="https:\/\/cancionero-ten.vercel.app\/\?token=a&amp;next=b"/);
  assert.match(examples[3].html,/#token=demo/);
  assert.doesNotMatch(institutionalEmail({title:'T',buttonUrl:'javascript:alert(1)',buttonLabel:'Open'}),/href=/);
  assert.doesNotMatch(approvedEmail({mote:'M',appUrl:''}).html,/href=/);
});
test('SMTP message serialization includes HTML, text and inline PNG without sending email',async()=>{
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  for(const mail of examples){const result=await transport.sendMail({from:'from@example.test',to:'to@example.test',...mail});const serialized=result.message.toString();assert.match(serialized,/Content-ID: <tuna-crest@cancionero>/);assert.match(serialized,/Content-Type: image\/png/);assert.match(serialized,/multipart\/alternative/);assert.match(serialized,/Content-Disposition: inline/);}
});
test('production sendEmail forwards embedded crest and preserves recipients and plaintext',async()=>{
  const original=nodemailer.createTransport, savedUser=process.env.GMAIL_USER, savedPassword=process.env.GMAIL_APP_PASSWORD;
  let captured;
  process.env.GMAIL_USER='sender@example.test';process.env.GMAIL_APP_PASSWORD='test-only';
  nodemailer.createTransport=()=>({sendMail:async message=>{captured=message;return{messageId:'test',accepted:[message.to],rejected:[]};}});
  try{const {sendEmail}=await import('../lib/email.js');const result=await sendEmail({to:'member@example.test',cc:'admin@example.test',...examples[0]});assert.equal(result.ok,true);assert.equal(captured.to,'member@example.test');assert.equal(captured.cc,'admin@example.test');assert.equal(captured.text,examples[0].text);assert.equal(captured.attachments[0].cid,'tuna-crest@cancionero');}
  finally{nodemailer.createTransport=original;if(savedUser===undefined)delete process.env.GMAIL_USER;else process.env.GMAIL_USER=savedUser;if(savedPassword===undefined)delete process.env.GMAIL_APP_PASSWORD;else process.env.GMAIL_APP_PASSWORD=savedPassword;}
});
