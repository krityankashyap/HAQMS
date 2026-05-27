'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Navbar from '@/components/common/Navbar';
import Link from 'next/link';
import {
  User, Phone, Mail, Calendar, ClipboardList, Activity,
  AlertCircle, ArrowLeft, FileText, CheckCircle, XCircle, Clock,
} from 'lucide-react';

const STATUS_STYLES = {
  PENDING:   { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20',   icon: Clock },
  COMPLETED: { cls: 'bg-teal-500/10 text-teal-600 border-teal-500/20',     icon: CheckCircle },
  CANCELLED: { cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20',     icon: XCircle },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${s.cls}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

export default function PatientHistoryRecords() {
  const { id } = useParams();
  const { user, token, API_BASE_URL } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!id) return;

    const fetchPatient = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/patients/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(res.status === 404 ? 'Patient not found.' : 'Failed to load patient record.');
        }
        const data = await res.json();
        setPatient(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPatient();
  }, [id, user?.id]);

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 sm:p-8 space-y-6">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center gap-3 text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && !error && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="pulse-loader"><div></div><div></div></div>
            <p className="mt-4 text-sm font-semibold text-slate-400">Loading patient record…</p>
          </div>
        )}

        {patient && (
          <>
            {/* Patient Info Banner */}
            <div className="glass p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-xl shrink-0">
                  <User className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                    {patient.name}
                  </h1>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    {patient.gender} · {patient.age} yrs
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
                    {patient.phoneNumber && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-4 w-4 text-slate-400" />
                        {patient.phoneNumber}
                      </span>
                    )}
                    {patient.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-4 w-4 text-slate-400" />
                        {patient.email}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-slate-400" />
                      Registered {new Date(patient.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Medical History */}
            <div className="glass p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-400 uppercase tracking-widest">
                <FileText className="h-4 w-4" />
                Clinical Background
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-6 whitespace-pre-line">
                {patient.medicalHistory ?? (
                  <span className="italic text-slate-400">No medical history on record.</span>
                )}
              </p>
            </div>

            {/* Appointment History */}
            <div className="glass p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-400 uppercase tracking-widest">
                <ClipboardList className="h-4 w-4" />
                Appointment History
                <span className="ml-auto px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold normal-case tracking-normal">
                  {patient.appointments?.length ?? 0} total
                </span>
              </h2>

              {!patient.appointments?.length ? (
                <div className="py-10 text-center">
                  <Activity className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-semibold">No appointments recorded for this patient.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/50 text-left">
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Doctor</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Specialization</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Reason</th>
                        <th className="px-4 py-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {patient.appointments.map((appt) => (
                        <tr key={appt.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {new Date(appt.appointmentDate).toLocaleDateString(undefined, {
                              year: 'numeric', month: 'short', day: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                            {appt.doctor?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-teal-600 dark:text-teal-400 font-semibold whitespace-nowrap">
                            {appt.doctor?.specialization ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                            {appt.reason || <span className="italic text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={appt.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
