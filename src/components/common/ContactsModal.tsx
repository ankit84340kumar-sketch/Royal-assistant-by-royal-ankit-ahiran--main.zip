import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Phone, UserPlus, Trash2, Search, PhoneCall, CheckCircle } from "lucide-react";
import {
  ContactEntry,
  getStoredContacts,
  saveContacts,
  addContact,
  placeNativePhoneCall,
} from "../../services/contactService";

interface ContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCall?: (contact: ContactEntry) => void;
}

export default function ContactsModal({ isOpen, onClose, onSelectCall }: ContactsModalProps) {
  const [contacts, setContacts] = useState<ContactEntry[]>(() => getStoredContacts());
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("Mobile");
  const [callingContactId, setCallingContactId] = useState<string | null>(null);

  if (!isOpen) return null;

  const refreshContacts = () => {
    setContacts([...getStoredContacts()]);
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;
    addContact(newName.trim(), newPhone.trim(), newLabel);
    setNewName("");
    setNewPhone("");
    setShowAddForm(false);
    refreshContacts();
  };

  const handleDeleteContact = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    saveContacts(updated);
    setContacts(updated);
  };

  const handleCall = (contact: ContactEntry) => {
    setCallingContactId(contact.id);
    placeNativePhoneCall(contact.phone);
    if (onSelectCall) {
      onSelectCall(contact);
    }
    setTimeout(() => {
      setCallingContactId(null);
    }, 2000);
  };

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.lastTwoDigits.includes(searchQuery)
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#0f0f16] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 text-white relative overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <Phone size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Phone Contacts (फोन कांटेक्ट)</h3>
                <p className="text-xs text-white/50">Smart duplicate voice resolution by last 2 digits</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Search bar & Add Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, number or last 2 digits..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
            >
              <UserPlus size={14} />
              <span>{showAddForm ? "Cancel" : "Add Contact"}</span>
            </button>
          </div>

          {/* Add Contact Inline Form */}
          {showAddForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleAddContact}
              className="p-3 bg-white/[0.04] border border-emerald-500/30 rounded-xl space-y-2.5 text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Enter Contact Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500"
                  required
                />
                <input
                  type="tel"
                  placeholder="Enter Phone Number"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
              <div className="flex items-center justify-between">
                <select
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="px-3 py-1.5 bg-[#1a1a24] border border-white/10 rounded-lg text-white text-xs"
                >
                  <option value="Mobile">Mobile</option>
                  <option value="Airtel">Airtel</option>
                  <option value="Jio">Jio</option>
                  <option value="Work">Work</option>
                  <option value="Home">Home</option>
                  <option value="Friend">Friend</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                >
                  Save Contact
                </button>
              </div>
            </motion.form>
          )}

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] max-h-[350px]">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-xs">
                No contacts found matching "{searchQuery}".
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/10 flex items-center justify-between gap-3 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white truncate">
                        {contact.name}
                      </span>
                      {contact.label && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                          {contact.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-white/60">
                      <span className="font-mono">{contact.phone}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                        Last: {contact.lastTwoDigits}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCall(contact)}
                      className={`p-2.5 rounded-xl text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-md ${
                        callingContactId === contact.id
                          ? "bg-emerald-500 text-white scale-105"
                          : "bg-emerald-600/80 hover:bg-emerald-600 text-white"
                      }`}
                      title={`Call ${contact.name} (${contact.phone})`}
                    >
                      {callingContactId === contact.id ? (
                        <>
                          <CheckCircle size={14} />
                          <span className="text-[11px]">Dialing</span>
                        </>
                      ) : (
                        <>
                          <PhoneCall size={14} />
                          <span className="text-[11px]">Call</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteContact(contact.id)}
                      className="p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete contact"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bottom Help Tip */}
          <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-[11px] text-violet-200/80 flex items-center gap-2">
            <span className="font-bold text-violet-400">💡 Voice Tip:</span>
            <span>Say "Call Sonu" → If multiple numbers exist, Zoya asks for last 2 digits (e.g. 52, 88, 48, 19).</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
