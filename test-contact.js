#!/usr/bin/env node
"use strict";

/* Posts a sample enquiry to /api/contact so the mail path can be checked
   end to end. Requires Node 18+ and a running server. */

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

const sample = {
  nome: "Teste Automático",
  email: "teste@example.com",
  empresa: "ACME Berries",
  cargo: "Buyer",
  pais: "Portugal",
  telefone: "+351916286989",
  interesse: "Long Canes Framboesa",
  quantidade: "500",
  mensagem: "Mensagem de teste enviada por test-contact.js — pode ser ignorada."
};

async function main() {
  const target = `${BASE_URL}/api/contact`;
  console.log(`POST ${target}`);

  let response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sample)
    });
  } catch (error) {
    console.error(`Could not reach the server: ${error.message}`);
    console.error("Is it running? Start it with: npm start");
    process.exit(1);
  }

  const body = (await response.text()).slice(0, 500);
  console.log(`HTTP ${response.status} ${body}`);

  if (response.ok) {
    console.log(`Accepted — a message should arrive at MAIL_TO shortly.`);
    return;
  }

  if (response.status === 404) {
    console.error("No /api/contact route. The static files are being served without server.js.");
  } else if (response.status === 429) {
    console.error("Rate limited — 5 requests per 10 minutes per IP. Wait and retry.");
  } else if (response.status === 500) {
    console.error("Delivery failed. Check the server log for the MailerSend reason;");
    console.error("#MS42207 means the sending domain is not verified yet (see README.md).");
  }
  process.exit(1);
}

main();
