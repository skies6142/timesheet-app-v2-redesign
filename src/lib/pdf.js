import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateLong, formatABN, addDaysToDate, groupInvoiceEntries } from './utils';

export function generateInvoicePDF(invoice, settings) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const pageH = 297;
  const marginL = 20;
  const marginR = 20;
  const usableW = pageW - marginL - marginR; // 170mm

  doc.setFont('helvetica');

  // ── Business Name Header Band ─────────────────────────────────
  const bandY = 14;
  const bandH = 16;
  doc.setFillColor(218, 228, 244);
  doc.rect(marginL, bandY, usableW, bandH, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 15, 15);
  doc.text(settings.businessName || 'Your Business', marginL + 5, bandY + 11);

  // ── INVOICE Heading ───────────────────────────────────────────
  const invoiceHeadY = bandY + bandH + 10;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 15, 15);
  doc.text('INVOICE', marginL, invoiceHeadY);

  // ── Three-Column Address Block ────────────────────────────────
  const blockY = invoiceHeadY + 8;
  const blockH = 46;
  const pad = 5;

  // Column widths: client=54, meta=59, business=53, gaps=2 each → 54+2+59+2+53=170 ✓
  const colW = [54, 59, 53];
  const colX = [
    marginL,
    marginL + colW[0] + 2,
    marginL + colW[0] + 2 + colW[1] + 2,
  ];

  // Column backgrounds
  doc.setFillColor(238, 244, 253);
  doc.rect(colX[0], blockY, colW[0], blockH, 'F');
  doc.setFillColor(246, 249, 255);
  doc.rect(colX[1], blockY, colW[1], blockH, 'F');
  doc.setFillColor(238, 244, 253);
  doc.rect(colX[2], blockY, colW[2], blockH, 'F');

  // LEFT: Client info
  let ly = blockY + pad + 3;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 15, 15);
  const clientName = invoice.clientName || settings.defaultClientName || 'Client';
  doc.text(clientName, colX[0] + pad, ly);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(45, 45, 45);
  if (invoice.clientAddress) {
    const addrLines = doc.splitTextToSize(invoice.clientAddress, colW[0] - pad * 2);
    for (const line of addrLines) {
      ly += 5;
      doc.text(line, colX[0] + pad, ly);
    }
  }
  ly += 5;
  doc.text('AUS', colX[0] + pad, ly);

  // CENTER: Invoice meta — label bold on its own line, value normal below
  const metaItems = [
    { label: 'Invoice Date', value: formatDateLong(invoice.date) },
    { label: 'Invoice Number', value: invoice.invoiceNumber },
    { label: 'Reference/PO #', value: invoice.reference || '' },
  ];
  let my = blockY + pad + 3;
  for (const { label, value } of metaItems) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 15, 15);
    doc.text(label, colX[1] + pad, my);
    my += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 45, 45);
    doc.text(value || '', colX[1] + pad, my);
    my += 9;
  }

  // RIGHT: Business info — right-aligned within column
  const bizRX = colX[2] + colW[2] - pad;
  let ry = blockY + pad + 3;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 15, 15);
  doc.text(settings.businessName || '', bizRX, ry, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(45, 45, 45);
  if (settings.abn) {
    ry += 5;
    doc.text(`ABN - ${formatABN(settings.abn)}`, bizRX, ry, { align: 'right' });
  }
  if (settings.address) {
    ry += 5;
    doc.text(settings.address, bizRX, ry, { align: 'right' });
  }
  const cityLine = [settings.suburb, settings.state, settings.postcode].filter(Boolean).join(' ');
  if (cityLine) {
    ry += 5;
    doc.text(cityLine, bizRX, ry, { align: 'right' });
  }

  // ── Divider ───────────────────────────────────────────────────
  const divY = blockY + blockH + 5;
  doc.setLineWidth(0.3);
  doc.setDrawColor(180, 188, 205);
  doc.line(marginL, divY, pageW - marginR, divY);

  // ── Line Items Table ──────────────────────────────────────────
  // Group entries: same description + rate → single line
  const groups = groupInvoiceEntries(invoice.entries);
  const tableBody = groups.map((g) => {
    let descLine;
    if (g.sortedDates.length === 1) {
      descLine = `${formatDateLong(g.sortedDates[0])} – ${g.desc}`;
    } else {
      const range = `${formatDateLong(g.sortedDates[0])} – ${formatDateLong(g.sortedDates[g.sortedDates.length - 1])}`;
      descLine = `${g.desc}\n${range}  (${g.sortedDates.length} days)`;
    }
    return [
      descLine,
      g.hours.toFixed(2),
      `$${g.rate.toFixed(2)}`,
      `$${g.earnings.toFixed(2)}`,
    ];
  });

  const subtotal = invoice.subtotal;
  const gstAmount = invoice.gstAmount || 0;
  const total = invoice.total;

  if (settings.gstRegistered && gstAmount > 0) {
    tableBody.push([
      { content: 'Subtotal', colSpan: 3, styles: { halign: 'right', fontStyle: 'normal' } },
      `$${subtotal.toFixed(2)}`,
    ]);
    tableBody.push([
      { content: 'GST (10%)', colSpan: 3, styles: { halign: 'right', fontStyle: 'normal' } },
      `$${gstAmount.toFixed(2)}`,
    ]);
  }
  tableBody.push([
    { content: 'TOTAL AUD', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [238, 244, 253] } },
    { content: `$${total.toFixed(2)}`, styles: { fontStyle: 'bold', fillColor: [238, 244, 253] } },
  ]);

  autoTable(doc, {
    startY: divY + 5,
    margin: { left: marginL, right: marginR },
    head: [['Description', 'Qty (hrs)', 'Unit Price', 'Total AUD']],
    body: tableBody,
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [10, 10, 10],
      fontStyle: 'bold',
      fontSize: 10,
      lineWidth: { bottom: 0.4 },
      lineColor: [180, 188, 205],
      cellPadding: { top: 4, bottom: 4, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [246, 249, 255] },
    bodyStyles: { textColor: [30, 30, 30], fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 2, right: 2 } },
    columnStyles: {
      0: { cellWidth: 95 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    theme: 'plain',
  });

  // ── Footer ────────────────────────────────────────────────────
  const finalY = doc.lastAutoTable.finalY + 12;
  const dueDate = formatDateLong(addDaysToDate(invoice.date, settings.paymentTermsDays || 14));

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 15, 15);
  doc.text(`Due Date: ${dueDate}`, marginL, finalY);

  let footerY = finalY + 8;

  const hasBankDetails = settings.bankName || settings.bsb || settings.accountNumber;
  if (hasBankDetails) {
    // Show structured bank details — skip paymentNotes to avoid duplication
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 15, 15);
    doc.text('Payment Details:', marginL, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 45, 45);
    footerY += 6;
    if (settings.bankName) { doc.text(`Bank: ${settings.bankName}`, marginL, footerY); footerY += 5; }
    if (settings.bsb)      { doc.text(`BSB: ${settings.bsb}`, marginL, footerY); footerY += 5; }
    if (settings.accountNumber) { doc.text(`Account: ${settings.accountNumber}`, marginL, footerY); footerY += 5; }
    doc.text(`Reference: ${invoice.invoiceNumber}`, marginL, footerY);
    footerY += 5;
    doc.text('Please use your invoice number as the payment reference.', marginL, footerY);
  } else if (settings.paymentNotes) {
    // No structured bank fields — fall back to freeform paymentNotes
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70, 75, 85);
    const noteLines = doc.splitTextToSize(settings.paymentNotes, usableW);
    doc.text(noteLines, marginL, footerY);
  }

  // Bottom branding line
  doc.setLineWidth(0.2);
  doc.setDrawColor(200, 205, 215);
  doc.line(marginL, pageH - 14, pageW - marginR, pageH - 14);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(155, 160, 170);
  doc.text('Generated by Docket', pageW / 2, pageH - 9, { align: 'center' });

  return doc;
}

export function downloadInvoicePDF(invoice, settings) {
  const doc = generateInvoicePDF(invoice, settings);
  doc.save(`${invoice.invoiceNumber}.pdf`);
}
