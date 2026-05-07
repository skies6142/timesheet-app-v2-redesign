import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { formatDateLong, formatABN, addDaysToDate, groupInvoiceEntries } from '../../lib/utils';
import { generateInvoicePDF } from '../../lib/pdf';
import BottomSheet from '../ui/BottomSheet';
import { Download, CheckCircle, ArrowLeft, Share2 } from 'lucide-react';

export default function InvoicePreviewModal({ isOpen, onClose, invoice, onConfirm, readOnly = false }) {
  const { settings, addToast } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [sharing, setSharing] = useState(false);

  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare;

  // Editable invoice fields
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (invoice) {
      setClientName(invoice.clientName || '');
      setClientAddress(invoice.clientAddress || '');
      setReference(invoice.reference || '');
    }
  }, [invoice]);

  if (!invoice || !settings) return null;

  const dueDate = formatDateLong(addDaysToDate(invoice.date, settings.paymentTermsDays || 14));
  const hasBankDetails = settings.bankName || settings.bsb || settings.accountNumber;

  const buildFinalInvoice = () => ({ ...invoice, clientName, clientAddress, reference });

  // Share via Web Share API (email, AirDrop, etc.)
  const handleShare = async () => {
    setSharing(true);
    try {
      const finalInvoice = buildFinalInvoice();
      const filename = `${invoice.invoiceNumber}.pdf`;
      const doc = generateInvoicePDF(finalInvoice, settings);
      const blob = doc.output('blob');
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: filename, files: [file] });
        addToast('Invoice shared', 'success');
      } else {
        // canShare() is true but files sharing isn't — fall back to save
        doc.save(filename);
        addToast('PDF saved', 'success');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        addToast('PDF generation failed', 'error');
        console.error(e);
      }
    } finally {
      setSharing(false);
    }
  };

  // Save directly to device (Downloads folder on Android / file dialog on desktop)
  const handleSavePDF = () => {
    try {
      const finalInvoice = buildFinalInvoice();
      const doc = generateInvoicePDF(finalInvoice, settings);
      doc.save(`${invoice.invoiceNumber}.pdf`);
      addToast('PDF saved to device', 'success');
    } catch (e) {
      addToast('PDF generation failed', 'error');
      console.error(e);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm(buildFinalInvoice());
    } finally {
      setConfirming(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Invoice Preview" fullScreen>
      <div className="px-4 py-4 space-y-4">

        {/* Editable fields (dark UI) */}
        {!readOnly && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Invoice Details</p>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Client Name</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:border-amber-400 min-h-[40px]"
                placeholder="Client name"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Client Address <span className="text-zinc-600">(optional)</span></label>
              <textarea
                value={clientAddress}
                onChange={(e) => setClientAddress(e.target.value)}
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:border-amber-400 resize-none"
                placeholder="Street, Suburb State Postcode"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Reference / PO # <span className="text-zinc-600">(optional)</span></label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:border-amber-400 min-h-[40px]"
                placeholder="PO-12345"
              />
            </div>
          </div>
        )}

        {/* White invoice card */}
        <div className="invoice-preview rounded-xl overflow-hidden shadow-lg">

          {/* Business name header band */}
          <div className="px-4 py-3" style={{ backgroundColor: '#dae4f4' }}>
            <p className="text-base font-bold" style={{ color: '#0f0f0f' }}>
              {settings.businessName || 'Your Business'}
            </p>
          </div>

          <div className="px-4 pt-3 pb-4">
            {/* INVOICE heading */}
            <p className="text-sm font-bold text-zinc-900 mb-3">INVOICE</p>

            {/* Three-column address block */}
            <div className="grid grid-cols-3 gap-0.5 mb-4 text-[9px]">
              {/* Client */}
              <div className="px-2 py-2.5" style={{ backgroundColor: '#eef4fd' }}>
                <p className="font-bold text-zinc-800 mb-0.5">{clientName || 'Client'}</p>
                {clientAddress && (
                  <p className="text-zinc-600 whitespace-pre-line leading-snug">{clientAddress}</p>
                )}
                <p className="text-zinc-600">AUS</p>
              </div>

              {/* Invoice meta — label bold on its own line, value below */}
              <div className="px-2 py-2.5" style={{ backgroundColor: '#f6f9ff' }}>
                {[
                  ['Invoice Date', formatDateLong(invoice.date)],
                  ['Invoice Number', invoice.invoiceNumber],
                  ['Reference/PO #', reference || ''],
                ].map(([label, value]) => (
                  <div key={label} className="mb-1.5">
                    <p className="font-bold text-zinc-800 leading-tight">{label}</p>
                    <p className="text-zinc-600 leading-tight">{value || '—'}</p>
                  </div>
                ))}
              </div>

              {/* Business info — right-aligned */}
              <div className="px-2 py-2.5 text-right" style={{ backgroundColor: '#eef4fd' }}>
                <p className="font-bold text-zinc-800 mb-0.5">{settings.businessName}</p>
                {settings.abn && <p className="text-zinc-600">ABN - {formatABN(settings.abn)}</p>}
                {settings.address && <p className="text-zinc-600">{settings.address}</p>}
                {(settings.suburb || settings.state || settings.postcode) && (
                  <p className="text-zinc-600">
                    {[settings.suburb, settings.state, settings.postcode].filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-200 mb-2" />

            {/* Line items table */}
            <table className="w-full text-[9px]">
              <thead>
                <tr className="border-b border-zinc-300">
                  <th className="text-left py-1.5 font-bold text-zinc-800 w-[48%]">Description</th>
                  <th className="text-right py-1.5 font-bold text-zinc-800">Qty (hrs)</th>
                  <th className="text-right py-1.5 font-bold text-zinc-800">Unit Price</th>
                  <th className="text-right py-1.5 font-bold text-zinc-800">Total AUD</th>
                </tr>
              </thead>
              <tbody>
                {groupInvoiceEntries(invoice.entries).map((g, i) => {
                  let descNode;
                  if (g.sortedDates.length === 1) {
                    descNode = `${formatDateLong(g.sortedDates[0])} – ${g.desc}`;
                  } else {
                    const range = `${formatDateLong(g.sortedDates[0])} – ${formatDateLong(g.sortedDates[g.sortedDates.length - 1])}`;
                    descNode = (
                      <>
                        <span>{g.desc}</span>
                        <span className="block text-[8px] text-zinc-400 mt-0.5">{range}  ({g.sortedDates.length} days)</span>
                      </>
                    );
                  }
                  return (
                    <tr key={i} style={i % 2 === 1 ? { backgroundColor: '#f6f9ff' } : {}}>
                      <td className="py-1 pr-1 text-zinc-700">{descNode}</td>
                      <td className="py-1 text-right text-zinc-700">{g.hours.toFixed(2)}</td>
                      <td className="py-1 text-right text-zinc-700">${g.rate.toFixed(2)}</td>
                      <td className="py-1 text-right text-zinc-700">${g.earnings.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {settings.gstRegistered && (
                  <>
                    <tr className="border-t border-zinc-200">
                      <td colSpan={3} className="text-right py-1 text-zinc-500 text-[8px]">Subtotal</td>
                      <td className="text-right py-1 text-zinc-700">${invoice.subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="text-right py-1 text-zinc-500 text-[8px]">GST (10%)</td>
                      <td className="text-right py-1 text-zinc-700">${(invoice.gstAmount || 0).toFixed(2)}</td>
                    </tr>
                  </>
                )}
                <tr style={{ backgroundColor: '#eef4fd' }}>
                  <td colSpan={3} className="text-right py-1.5 font-bold text-zinc-900">TOTAL AUD</td>
                  <td className="text-right py-1.5 font-bold text-zinc-900">${invoice.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Footer */}
            <div className="mt-3 pt-2 border-t border-zinc-200 space-y-1">
              <p className="font-bold text-zinc-800 text-[9px]">Due Date: {dueDate}</p>
              {hasBankDetails ? (
                <div className="text-[9px] space-y-0.5">
                  <p className="font-bold text-zinc-700">Payment Details:</p>
                  {settings.bankName && <p className="text-zinc-600">Bank: {settings.bankName}</p>}
                  {settings.bsb && <p className="text-zinc-600">BSB: {settings.bsb}</p>}
                  {settings.accountNumber && <p className="text-zinc-600">Account: {settings.accountNumber}</p>}
                  <p className="text-zinc-600">Reference: {invoice.invoiceNumber}</p>
                  <p className="text-zinc-600">Please use your invoice number as the payment reference.</p>
                </div>
              ) : settings.paymentNotes ? (
                <p className="text-zinc-600 whitespace-pre-line text-[9px]">{settings.paymentNotes}</p>
              ) : null}
            </div>

            <div className="mt-3 pt-1.5 border-t border-zinc-100 text-center text-[8px] text-zinc-400">
              Generated by TimeSheet
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3 pb-4">
          {/* Share + Save PDF — two separate actions */}
          <div className={canShare ? 'grid grid-cols-2 gap-3' : ''}>
            {canShare && (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="flex items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-60 text-zinc-50 font-medium rounded-xl py-3.5 min-h-[52px] transition-colors"
              >
                <Share2 size={17} />
                {sharing ? 'Preparing…' : 'Share'}
              </button>
            )}
            <button
              onClick={handleSavePDF}
              className={`flex items-center justify-center gap-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-50 font-medium rounded-xl py-3.5 min-h-[52px] transition-colors ${!canShare ? 'w-full' : ''}`}
            >
              <Download size={17} />
              Save PDF
            </button>
          </div>

          {!readOnly && (
            <>
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-zinc-950 font-bold rounded-xl py-3.5 min-h-[52px] transition-colors"
              >
                <CheckCircle size={18} />
                {confirming ? 'Marking as Invoiced…' : 'Confirm & Mark as Invoiced'}
              </button>
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 py-2 min-h-[44px] transition-colors text-sm"
              >
                <ArrowLeft size={16} />
                Back to Entry Selection
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
