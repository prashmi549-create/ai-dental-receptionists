import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  HelpCircle,
  Stethoscope,
  FileText,
  DollarSign,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Clock,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Search,
} from 'lucide-react';
import {
  BusinessKnowledgeConfig,
  KnowledgeServiceItem,
  KnowledgeFAQItem,
  DEFAULT_BUSINESS_KNOWLEDGE,
} from '../types';
import {
  getBusinessKnowledge,
  saveBusinessKnowledge,
  resetBusinessKnowledgeToDefault,
  subscribeToBusinessKnowledge,
  validateBusinessKnowledge,
} from '../services/businessKnowledgeService';

interface AdminBusinessKnowledgeProps {
  adminEmail: string;
}

type KnowledgeTab = 'services' | 'faqs' | 'policies' | 'pricing' | 'additional';

export const AdminBusinessKnowledge: React.FC<AdminBusinessKnowledgeProps> = ({ adminEmail }) => {
  const [savedKnowledge, setSavedKnowledge] = useState<BusinessKnowledgeConfig>(DEFAULT_BUSINESS_KNOWLEDGE);
  const [formData, setFormData] = useState<BusinessKnowledgeConfig>(DEFAULT_BUSINESS_KNOWLEDGE);

  const [activeTab, setActiveTab] = useState<KnowledgeTab>('services');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // New Service draft state
  const [isAddingService, setIsAddingService] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceDraft, setServiceDraft] = useState<KnowledgeServiceItem>({
    id: '',
    name: '',
    description: '',
    durationMinutes: 30,
    priceText: '',
    category: 'General',
    active: true,
  });

  // New FAQ draft state
  const [isAddingFaq, setIsAddingFaq] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqDraft, setFaqDraft] = useState<KnowledgeFAQItem>({
    id: '',
    question: '',
    answer: '',
    keywords: [],
    category: 'General',
    active: true,
  });
  const [faqKeywordsInput, setFaqKeywordsInput] = useState('');

  // Search filter inside FAQs / Services
  const [searchQuery, setSearchQuery] = useState('');

  // Subscribe to real-time changes
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = subscribeToBusinessKnowledge((knowledge) => {
      if (isMounted) {
        setSavedKnowledge(knowledge);
        setFormData(knowledge);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Compute dirty state
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(savedKnowledge);
  }, [formData, savedKnowledge]);

  // Handle Save
  const handleSave = async () => {
    setStatusMessage(null);
    const validation = validateBusinessKnowledge(formData);
    if (!validation.isValid) {
      setStatusMessage({
        type: 'error',
        text: validation.errors[0] || 'Please correct errors before saving.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveBusinessKnowledge(formData, adminEmail);
      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: 'Business knowledge & FAQs successfully saved! The AI receptionist is updated in real-time.',
        });
        setSavedKnowledge(formData);
        setTimeout(() => setStatusMessage(null), 5000);
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to save business knowledge.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Unexpected error occurred while saving.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Reset to Defaults
  const handleResetToDefaults = async () => {
    if (
      !window.confirm(
        'Are you sure you want to reset all business knowledge and FAQs back to the Dental Care & Implants of Houston demo defaults? This will overwrite custom services, FAQs, and policies.'
      )
    ) {
      return;
    }

    setIsResetting(true);
    setStatusMessage(null);
    try {
      const result = await resetBusinessKnowledgeToDefault(adminEmail);
      if (result.success && result.config) {
        setSavedKnowledge(result.config);
        setFormData(result.config);
        setIsAddingService(false);
        setEditingServiceId(null);
        setIsAddingFaq(false);
        setEditingFaqId(null);
        setStatusMessage({
          type: 'success',
          text: 'Reset to verified Dental Care & Implants of Houston demo knowledge successfully!',
        });
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error || 'Failed to reset business knowledge.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error resetting to defaults.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  // Service Management Helpers
  const startAddService = () => {
    setServiceDraft({
      id: 'srv-' + Date.now(),
      name: '',
      description: '',
      durationMinutes: 30,
      priceText: '',
      category: 'General',
      active: true,
    });
    setEditingServiceId(null);
    setIsAddingService(true);
  };

  const startEditService = (service: KnowledgeServiceItem) => {
    setServiceDraft({ ...service });
    setEditingServiceId(service.id);
    setIsAddingService(true);
  };

  const saveServiceDraft = () => {
    if (!serviceDraft.name.trim()) {
      alert('Service name is required.');
      return;
    }

    const updatedServices = [...(formData.services || [])];
    const existingIndex = updatedServices.findIndex((s) => s.id === serviceDraft.id);

    if (existingIndex >= 0) {
      updatedServices[existingIndex] = { ...serviceDraft };
    } else {
      updatedServices.push({ ...serviceDraft });
    }

    setFormData({ ...formData, services: updatedServices });
    setIsAddingService(false);
    setEditingServiceId(null);
  };

  const removeService = (id: string) => {
    if (!window.confirm('Are you sure you want to remove this service?')) return;
    setFormData({
      ...formData,
      services: (formData.services || []).filter((s) => s.id !== id),
    });
    if (editingServiceId === id) {
      setIsAddingService(false);
      setEditingServiceId(null);
    }
  };

  const toggleServiceActive = (id: string) => {
    setFormData({
      ...formData,
      services: (formData.services || []).map((s) =>
        s.id === id ? { ...s, active: !s.active } : s
      ),
    });
  };

  // FAQ Management Helpers
  const startAddFaq = () => {
    setFaqDraft({
      id: 'faq-' + Date.now(),
      question: '',
      answer: '',
      keywords: [],
      category: 'General',
      active: true,
    });
    setFaqKeywordsInput('');
    setEditingFaqId(null);
    setIsAddingFaq(true);
  };

  const startEditFaq = (faq: KnowledgeFAQItem) => {
    setFaqDraft({ ...faq });
    setFaqKeywordsInput((faq.keywords || []).join(', '));
    setEditingFaqId(faq.id);
    setIsAddingFaq(true);
  };

  const saveFaqDraft = () => {
    if (!faqDraft.question.trim() || !faqDraft.answer.trim()) {
      alert('Both question and answer are required for an FAQ.');
      return;
    }

    const keywords = faqKeywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const updatedFaq: KnowledgeFAQItem = {
      ...faqDraft,
      keywords,
    };

    const updatedFaqs = [...(formData.faqs || [])];
    const existingIndex = updatedFaqs.findIndex((f) => f.id === updatedFaq.id);

    if (existingIndex >= 0) {
      updatedFaqs[existingIndex] = updatedFaq;
    } else {
      updatedFaqs.push(updatedFaq);
    }

    setFormData({ ...formData, faqs: updatedFaqs });
    setIsAddingFaq(false);
    setEditingFaqId(null);
  };

  const removeFaq = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this FAQ?')) return;
    setFormData({
      ...formData,
      faqs: (formData.faqs || []).filter((f) => f.id !== id),
    });
    if (editingFaqId === id) {
      setIsAddingFaq(false);
      setEditingFaqId(null);
    }
  };

  const toggleFaqActive = (id: string) => {
    setFormData({
      ...formData,
      faqs: (formData.faqs || []).map((f) =>
        f.id === id ? { ...f, active: !f.active } : f
      ),
    });
  };

  if (isLoading) {
    return (
      <div id="admin-knowledge-loading" className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-3 text-slate-600 font-medium">Loading business knowledge...</span>
      </div>
    );
  }

  // Filtered views
  const filteredServices = (formData.services || []).filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFaqs = (formData.faqs || []).filter(
    (f) =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.keywords || []).some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div id="admin-business-knowledge-section" className="space-y-6">
      {/* Header Banner */}
      <div
        id="admin-knowledge-header"
        className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Business Knowledge & FAQs</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin Verified
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              Manage the customer-facing knowledge your AI receptionist uses to answer questions.
              The receptionist strictly grounds answers on this information and will never hallucinate or invent unverified facts.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            id="admin-knowledge-reset-btn"
            type="button"
            onClick={handleResetToDefaults}
            disabled={isResetting || isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            title="Reset to Dental Care & Implants of Houston demo information"
          >
            {isResetting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Reset to Demo Defaults
          </button>

          <button
            id="admin-knowledge-save-btn"
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving || isResetting}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all ${
              isDirty
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving to Firestore...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Message Notification */}
      {statusMessage && (
        <div
          id="admin-knowledge-status-alert"
          className={`p-4 rounded-xl border flex items-start gap-3 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{statusMessage.text}</div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dirty Draft Notice */}
      {isDirty && (
        <div
          id="admin-knowledge-dirty-notice"
          className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>You have unsaved knowledge changes. Click "Save Changes" to update the AI receptionist.</span>
          </div>
          <button
            onClick={() => setFormData(savedKnowledge)}
            className="font-semibold underline hover:text-amber-900 ml-4"
          >
            Discard
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 gap-1 overflow-x-auto">
        <button
          id="tab-services-btn"
          type="button"
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'services'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          Services ({formData.services?.length || 0})
        </button>

        <button
          id="tab-faqs-btn"
          type="button"
          onClick={() => setActiveTab('faqs')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'faqs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          FAQs ({formData.faqs?.length || 0})
        </button>

        <button
          id="tab-policies-btn"
          type="button"
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'policies'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          Business Policies
        </button>

        <button
          id="tab-pricing-btn"
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'pricing'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Pricing & Insurance
        </button>

        <button
          id="tab-additional-btn"
          type="button"
          onClick={() => setActiveTab('additional')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'additional'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Info className="w-4 h-4" />
          Additional Info
        </button>
      </div>

      {/* TAB CONTENT 1: SERVICES */}
      {activeTab === 'services' && (
        <div id="knowledge-tab-services" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="search-services-input"
                type="text"
                placeholder="Search services..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              id="add-service-btn"
              type="button"
              onClick={startAddService}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Service
            </button>
          </div>

          {/* Service Add/Edit Modal or Form */}
          {isAddingService && (
            <div
              id="service-form-card"
              className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  {editingServiceId ? 'Edit Dental Service' : 'Add New Dental Service'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingService(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Service Name *
                  </label>
                  <input
                    id="service-name-input"
                    type="text"
                    placeholder="e.g. Dental Implants, Invisalign, Routine Cleaning"
                    value={serviceDraft.name}
                    onChange={(e) => setServiceDraft({ ...serviceDraft, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Category
                  </label>
                  <input
                    id="service-category-input"
                    type="text"
                    placeholder="e.g. Implants, Cosmetic, Preventive, Restorative"
                    value={serviceDraft.category || ''}
                    onChange={(e) =>
                      setServiceDraft({ ...serviceDraft, category: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Description & Clinical Benefits *
                  </label>
                  <textarea
                    id="service-desc-input"
                    rows={2}
                    placeholder="What the procedure involves and patient benefits..."
                    value={serviceDraft.description}
                    onChange={(e) =>
                      setServiceDraft({ ...serviceDraft, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Estimated Duration (Minutes)
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="service-duration-input"
                      type="number"
                      min={10}
                      step={5}
                      value={serviceDraft.durationMinutes || 30}
                      onChange={(e) =>
                        setServiceDraft({
                          ...serviceDraft,
                          durationMinutes: parseInt(e.target.value) || 30,
                        })
                      }
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Configured Pricing (Optional)
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="service-pricing-input"
                      type="text"
                      placeholder="e.g. Free consultation; or Contact clinic for quote"
                      value={serviceDraft.priceText || ''}
                      onChange={(e) =>
                        setServiceDraft({ ...serviceDraft, priceText: e.target.value })
                      }
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Leave blank to instruct receptionist to recommend consultation / contact clinic.
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceDraft.active !== false}
                    onChange={(e) =>
                      setServiceDraft({ ...serviceDraft, active: e.target.checked })
                    }
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Active (offered by receptionist)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingService(false)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-service-draft-btn"
                    type="button"
                    onClick={saveServiceDraft}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    {editingServiceId ? 'Update Service' : 'Add to List'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Services List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredServices.map((service) => (
              <div
                key={service.id}
                id={`service-card-${service.id}`}
                className={`bg-white rounded-xl border p-4 shadow-sm transition-all flex flex-col justify-between ${
                  service.active === false
                    ? 'border-slate-200 opacity-60 bg-slate-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-base">{service.name}</h4>
                      {service.category && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                          {service.category}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleServiceActive(service.id)}
                        className={`p-1.5 rounded-lg text-xs font-medium transition-colors ${
                          service.active !== false
                            ? 'text-emerald-700 hover:bg-emerald-50'
                            : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        title={service.active !== false ? 'Active' : 'Inactive'}
                      >
                        {service.active !== false ? (
                          <ToggleRight className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditService(service)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50"
                        title="Edit service"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeService(service.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        title="Delete service"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 mb-3">{service.description}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    {service.durationMinutes ? `${service.durationMinutes} mins` : '30 mins'}
                  </span>
                  <span className="font-medium text-slate-700">
                    {service.priceText ? service.priceText : 'Contact clinic for quote'}
                  </span>
                </div>
              </div>
            ))}

            {filteredServices.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
                <Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-medium">No services found.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Click "Add Service" to register treatments offered by your clinic.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: FAQS */}
      {activeTab === 'faqs' && (
        <div id="knowledge-tab-faqs" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                id="search-faqs-input"
                type="text"
                placeholder="Search FAQs by question or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              id="add-faq-btn"
              type="button"
              onClick={startAddFaq}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add FAQ
            </button>
          </div>

          {/* FAQ Add/Edit Form */}
          {isAddingFaq && (
            <div
              id="faq-form-card"
              className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 space-y-4 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  {editingFaqId ? 'Edit FAQ' : 'Add New FAQ'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingFaq(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Question *
                  </label>
                  <input
                    id="faq-question-input"
                    type="text"
                    placeholder="e.g. Do you accept walk-ins? How long do dental implants last?"
                    value={faqDraft.question}
                    onChange={(e) => setFaqDraft({ ...faqDraft, question: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Verified Answer (spoken by AI Receptionist) *
                  </label>
                  <textarea
                    id="faq-answer-input"
                    rows={3}
                    placeholder="Clear, professional answer provided to patients..."
                    value={faqDraft.answer}
                    onChange={(e) => setFaqDraft({ ...faqDraft, answer: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Trigger Keywords (comma-separated)
                    </label>
                    <input
                      id="faq-keywords-input"
                      type="text"
                      placeholder="e.g. walkin, walk in, same day, emergency"
                      value={faqKeywordsInput}
                      onChange={(e) => setFaqKeywordsInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Category
                    </label>
                    <input
                      id="faq-category-input"
                      type="text"
                      placeholder="e.g. Appointments, Implants, General, Policies"
                      value={faqDraft.category || ''}
                      onChange={(e) => setFaqDraft({ ...faqDraft, category: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={faqDraft.active !== false}
                    onChange={(e) => setFaqDraft({ ...faqDraft, active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    Active (receptionist will answer this question)
                  </span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingFaq(false)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-faq-draft-btn"
                    type="button"
                    onClick={saveFaqDraft}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    {editingFaqId ? 'Update FAQ' : 'Save FAQ'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* FAQs List */}
          <div className="space-y-3">
            {filteredFaqs.map((faq) => (
              <div
                key={faq.id}
                id={`faq-item-${faq.id}`}
                className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${
                  faq.active === false
                    ? 'border-slate-200 opacity-60 bg-slate-50/50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
                      <h4 className="font-semibold text-slate-900 text-base">{faq.question}</h4>
                      {faq.category && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                          {faq.category}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 pl-6 leading-relaxed">{faq.answer}</p>
                    {faq.keywords && faq.keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pl-6 pt-1">
                        <span className="text-[11px] text-slate-400">Triggers:</span>
                        {faq.keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFaqActive(faq.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
                      title={faq.active !== false ? 'Active' : 'Inactive'}
                    >
                      {faq.active !== false ? (
                        <ToggleRight className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-slate-400" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditFaq(faq)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-50"
                      title="Edit FAQ"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFaq(faq.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="Delete FAQ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredFaqs.length === 0 && (
              <div className="py-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
                <HelpCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-medium">No FAQs found.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Click "Add FAQ" to train the receptionist on common patient questions.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: BUSINESS POLICIES */}
      {activeTab === 'policies' && (
        <div id="knowledge-tab-policies" className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900">Clinic Policies & Rules</h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure clinic policies. When patients ask about cancellation terms, check-in arrival times, or payments, the receptionist quotes these exact rules.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Cancellation & Rescheduling Policy
              </label>
              <textarea
                id="policy-cancellation-input"
                rows={3}
                placeholder="e.g. Please give at least 24 hours advance notice if you need to cancel or reschedule..."
                value={formData.policies?.cancellationPolicy || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    policies: {
                      ...formData.policies,
                      cancellationPolicy: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Arrival & Check-In Window Policy
              </label>
              <textarea
                id="policy-arrival-input"
                rows={2}
                placeholder="e.g. Please arrive 15 minutes prior to your appointment time to complete check-in..."
                value={formData.policies?.arrivalPolicy || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    policies: {
                      ...formData.policies,
                      arrivalPolicy: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                New Patient Intake Policy
              </label>
              <textarea
                id="policy-newpatient-input"
                rows={2}
                placeholder="e.g. New patients should bring a valid government photo ID and dental insurance card..."
                value={formData.policies?.newPatientPolicy || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    policies: {
                      ...formData.policies,
                      newPatientPolicy: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Payment & Deposit Terms
              </label>
              <textarea
                id="policy-payment-input"
                rows={2}
                placeholder="e.g. Copays and out-of-pocket estimates are due at time of service..."
                value={formData.policies?.paymentPolicy || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    policies: {
                      ...formData.policies,
                      paymentPolicy: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                General Office Policies (Optional)
              </label>
              <textarea
                id="policy-general-input"
                rows={2}
                placeholder="Any additional house rules or guidelines..."
                value={formData.policies?.generalPolicies || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    policies: {
                      ...formData.policies,
                      generalPolicies: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: PRICING & FINANCING / INSURANCE */}
      {activeTab === 'pricing' && (
        <div id="knowledge-tab-pricing" className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900">Pricing, Financing & Dental Insurance</h3>
            <p className="text-xs text-slate-500 mt-1">
              Configure how the receptionist handles pricing inquiries and financing/insurance questions.
              If no pricing notes are entered, the receptionist safely advises patients that costs depend on individual needs.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Pricing Guidance & Notes
              </label>
              <textarea
                id="pricing-notes-input"
                rows={3}
                placeholder="e.g. Detailed pricing requires a clinical exam and consultation. Free consultation offered for dental implants and clear aligners."
                value={formData.pricing?.pricingNotes || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    pricing: {
                      ...formData.pricing,
                      pricingNotes: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Approved Financing Partners (comma-separated)
              </label>
              <input
                id="financing-partners-input"
                type="text"
                placeholder="e.g. Cherry, CareCredit, Proceed Finance, Sunbit, Alphaeon, Basis"
                value={(formData.financing?.financingPartners || []).join(', ')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    financing: {
                      ...formData.financing,
                      financingPartners: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Financing Information & Terms
              </label>
              <textarea
                id="financing-notes-input"
                rows={2}
                placeholder="e.g. We partner with multiple flexible financing lenders offering 0% APR promotional options..."
                value={formData.financing?.financingNotes || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    financing: {
                      ...formData.financing,
                      financingNotes: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Accepted Insurance Guidelines
              </label>
              <textarea
                id="insurance-accepted-input"
                rows={3}
                placeholder="e.g. We accept most major PPO dental plans and Medicaid for patients under 21. Contact clinic to verify specific benefits."
                value={formData.financing?.insuranceAcceptedNotes || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    financing: {
                      ...formData.financing,
                      insuranceAcceptedNotes: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Out-of-Network & Self-Pay Policy
              </label>
              <textarea
                id="insurance-out-of-network-input"
                rows={2}
                placeholder="e.g. For out-of-network plans, we gladly submit courtesy insurance claims on your behalf..."
                value={formData.financing?.outOfNetworkPolicy || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    financing: {
                      ...formData.financing,
                      outOfNetworkPolicy: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: ADDITIONAL INFO */}
      {activeTab === 'additional' && (
        <div id="knowledge-tab-additional" className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-base font-bold text-slate-900">Additional Business Information</h3>
            <p className="text-xs text-slate-500 mt-1">
              Add doctor background, parking directions, languages spoken, or special clinic amenities.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Languages Spoken by Staff (comma-separated)
              </label>
              <input
                id="additional-languages-input"
                type="text"
                placeholder="e.g. English, Spanish, Vietnamese"
                value={(formData.additionalInfo?.languagesSpoken || []).join(', ')}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    additionalInfo: {
                      ...formData.additionalInfo,
                      languagesSpoken: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Parking & Arrival Directions
              </label>
              <textarea
                id="additional-parking-input"
                rows={2}
                placeholder="e.g. Ample free surface parking is available directly in front of the clinic entrance..."
                value={formData.additionalInfo?.parkingDirections || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    additionalInfo: {
                      ...formData.additionalInfo,
                      parkingDirections: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Doctors & Clinical Team Overview
              </label>
              <textarea
                id="additional-doctors-input"
                rows={3}
                placeholder="Information about practicing dentists..."
                value={formData.additionalInfo?.doctorBios || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    additionalInfo: {
                      ...formData.additionalInfo,
                      doctorBios: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                General Additional Notes
              </label>
              <textarea
                id="additional-notes-input"
                rows={3}
                placeholder="Any special equipment, sedation options, wheelchair accessibility, etc."
                value={formData.additionalInfo?.additionalNotes || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    additionalInfo: {
                      ...formData.additionalInfo,
                      additionalNotes: e.target.value,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
