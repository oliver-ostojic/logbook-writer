'use client';

import { useState, useEffect } from 'react';

type Role = {
  id: string | number;
  name?: string;
  code?: string;
  displayName?: string;
};

type Crew = {
  id: string;
  name: string;
  storeId: number;
  shiftStartMin: number;
  shiftEndMin: number;
  prefFirstHour?: string;
  prefTask?: string;
  prefBreakTiming?: number;
  roles: Array<{
    roleId: string | number;
    role: Role;
  }>;
};

export default function CrewManagementPage() {
  const [crew, setCrew] = useState<Crew[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editingCrew, setEditingCrew] = useState<Crew | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    storeId: '768', // default store id
  });

  useEffect(() => {
    fetchCrew();
    fetchRoles();
  }, []);

  const fetchCrew = async () => {
    const res = await fetch('http://localhost:4000/crew');
    const data = await res.json();
    setCrew(data);
  };

  const fetchRoles = async () => {
    // We'll need to add a roles endpoint, for now hardcode
    setRoles([
      { id: 1, code: 'REGISTER', displayName: 'Register' },
      { id: 2, code: 'PRODUCT', displayName: 'Product' },
      { id: 3, code: 'PARKING_HELM', displayName: 'Parking Helm' },
      { id: 4, code: 'MEAL_BREAK', displayName: 'Meal Break' },
      { id: 5, code: 'DEMO', displayName: 'Demo' },
      { id: 6, code: 'ORDER_WRITER', displayName: 'Order Writer' },
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      id: formData.id.trim(),
      name: formData.name,
      storeId: parseInt(formData.storeId, 10),
      // backend will fill defaults for shift times & other optional fields
    };

    try {
      let res: Response | null = null;
      if (isCreating) {
  res = await fetch('http://localhost:4000/crew', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (editingCrew) {
  res = await fetch(`http://localhost:4000/crew/${editingCrew.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (!res) throw new Error('No request executed');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }
      setFeedback({ text: `Crew ${isCreating ? 'created' : 'updated'} successfully`, type: 'success' });
      fetchCrew();
      resetForm();
    } catch (error) {
        const msg = (error instanceof Error) ? error.message : 'Unknown error';
        console.error('Error saving crew:', error);
        setFeedback({ text: `Failed to save crew: ${msg}`, type: 'error' });
    }
  };

  const handleEdit = (c: Crew) => {
    setEditingCrew(c);
    setIsCreating(false);
    setFormData({
      id: c.id,
      name: c.name,
      storeId: c.storeId.toString(),
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this crew member?')) {
  await fetch(`http://localhost:4000/crew/${id}`, { method: 'DELETE' });
      fetchCrew();
    }
  };

  const resetForm = () => {
  setFormData({ id: '', name: '', storeId: '768' });
    setEditingCrew(null);
    setIsCreating(false);
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  // Advanced role assignment removed in simplified UI.
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(t);
  }, [feedback]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Crew Management</h1>
        {feedback && (
          <div
            role="status"
            className={`mb-6 rounded px-4 py-3 text-sm font-medium border ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Crew List */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Crew Members</h2>
              <button
                onClick={() => {
                  resetForm();
                  setIsCreating(true);
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                + Add Crew
              </button>
            </div>

            <div className="space-y-3">
              {crew.map(c => (
                <div key={c.id} className="border rounded p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{c.name}</h3>
                      <p className="text-sm text-gray-600">ID: {c.id}</p>
                      <p className="text-sm text-gray-600">
                        Shift: {formatTime(c.shiftStartMin)} - {formatTime(c.shiftEndMin)}
                      </p>
                      {c.roles.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.roles.map(r => (
                            <span key={r.roleId} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {r.role.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(c)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          {(isCreating || editingCrew) && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">
                {isCreating ? 'Create Crew Member' : 'Edit Crew Member'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Employee ID</label>
                  <input
                    type="number"
                    required
                    disabled={!isCreating}
                    value={formData.id}
                    onChange={e => setFormData({ ...formData, id: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., 1280713"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Store ID</label>
                  <input
                    type="number"
                    required
                    value={formData.storeId}
                    onChange={e => setFormData({ ...formData, storeId: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="e.g., 768"
                  />
                </div>
                {/* Simplified form: only ID, Name, Store ID required */}

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  >
                    {isCreating ? 'Create' : 'Update'}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
