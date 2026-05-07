import { generateId, entryKey, calcWorkingHours, calcEarnings, formatInvoiceNumber } from './utils';
import { format, subDays } from 'date-fns';

// Generates 3 weeks of realistic sample data for a painter/tradie
export async function generateSampleData(settings) {
  const today = new Date();
  const rate = settings.defaultHourlyRate || 35;
  const client = settings.defaultClientName || 'Smith Constructions';
  const project = settings.defaultProjectName || 'Painting';
  const prefix = settings.invoicePrefix || 'INV-';

  const descriptions = [
    'Interior painting - living room',
    'Exterior prep and undercoat',
    'Feature wall - master bedroom',
    'Touch-ups and second coat',
    'Ceiling and cornice work',
    'Garage floor epoxy coat',
    'Bathroom waterproofing',
    'Fence and gate painting',
    'Kitchen repaint - walls and trim',
  ];

  const entries = [];

  // Helper: create entry
  function makeEntry(daysAgo, timeIn, timeOut, breakMins, desc, status, invoiceNumber = null) {
    const date = format(subDays(today, daysAgo), 'yyyy-MM-dd');
    const id = generateId();
    const key = entryKey(date, id);
    const workingHours = calcWorkingHours(timeIn, timeOut, breakMins);
    const earnings = calcEarnings(workingHours, rate);
    return {
      key,
      id,
      date,
      timeIn,
      timeOut,
      breakMinutes: breakMins,
      workingHours,
      hourlyRate: rate,
      earnings,
      projectName: project,
      clientName: client,
      description: desc,
      notes: '',
      status,
      invoiceNumber,
      billable: true,
    };
  }

  // Week 1 (3 weeks ago): 4 entries, all UNPAID
  entries.push(makeEntry(21, '07:30', '14:45', 30, descriptions[0], 'unpaid'));
  entries.push(makeEntry(20, '08:00', '16:00', 45, descriptions[1], 'unpaid'));
  entries.push(makeEntry(19, '07:15', '13:30', 20, descriptions[2], 'unpaid'));
  entries.push(makeEntry(17, '08:30', '15:00', 30, descriptions[3], 'unpaid'));

  // Week 2 (2 weeks ago): 5 entries, all INVOICED on INV-001
  const inv001 = formatInvoiceNumber(prefix, 1);
  entries.push(makeEntry(14, '07:00', '15:30', 30, descriptions[4], 'invoiced', inv001));
  entries.push(makeEntry(13, '08:15', '14:00', 20, descriptions[5], 'invoiced', inv001));
  entries.push(makeEntry(12, '07:45', '16:00', 45, descriptions[6], 'invoiced', inv001));
  entries.push(makeEntry(11, '08:00', '13:30', 30, descriptions[7], 'invoiced', inv001));
  entries.push(makeEntry(10, '07:30', '15:00', 30, descriptions[8], 'invoiced', inv001));

  // Week 3 (last week): 2 PAID CASH + 2 UNPAID
  entries.push(makeEntry(7,  '07:00', '12:00', 20, descriptions[0], 'paid_cash'));
  entries.push(makeEntry(6,  '08:30', '15:30', 30, descriptions[2], 'paid_cash'));
  entries.push(makeEntry(5,  '07:15', '14:30', 30, descriptions[3], 'unpaid'));
  entries.push(makeEntry(4,  '08:00', '16:00', 45, descriptions[1], 'unpaid'));

  // Save all entries
  for (const entry of entries) {
    await window.storage.set(entry.key, entry);
  }

  // Build INV-001 invoice record from week 2 entries
  const inv001Entries = entries.filter((e) => e.invoiceNumber === inv001);
  const subtotal = inv001Entries.reduce((s, e) => s + e.earnings, 0);
  const gstAmount = 0; // not GST registered by default
  const invoice = {
    invoiceNumber: inv001,
    date: format(subDays(today, 10), 'yyyy-MM-dd'), // invoice date = last entry date
    clientName: client,
    clientAddress: '',
    reference: '',
    entries: inv001Entries,
    subtotal: Math.round(subtotal * 100) / 100,
    gstAmount,
    total: Math.round((subtotal + gstAmount) * 100) / 100,
    status: 'outstanding',
  };
  await window.storage.set(`invoices:${inv001}`, invoice);

  // Set invoice counter to 1 (INV-001 already used)
  await window.storage.set('settings:invoice-counter', 1);
}
