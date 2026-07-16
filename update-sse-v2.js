const fs = require('fs');

const code = `'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Hospital, Department, Resource, Patient, Ambulance, TimelineEvent, AIRecommendation, User, Alert, ApiResource, ApiCase } from '@/types';
import { initialEvents, initialUsers, initialHospital } from '@/mock';
import { createParser } from 'eventsource-parser';
import { api } from '@/lib/api-service';

export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'disconnected';

interface SSEContextType {
  connectionState: ConnectionState;
  hospital: Hospital;
  departments: Department[];
  resources: Resource[];
  ambulances: Ambulance[];
  patients: Patient[];
  events: TimelineEvent[];
  alerts: Alert[];
  aiRecommendations: Record<string, AIRecommendation>;
  activeUser: User;
  setActiveUser: (user: User) => void;
  usersList: User[];
  allocateResources: (patientId: string, departmentId: string, doctorName: string, resourceId?: string) => void;
  triggerReconnection: () => void;
  activeEmergencyId: string | null;
  setActiveEmergencyId: (id: string | null) => void;
  loadEmergencyState: (id: string) => Promise<void>;
  declareNewEmergency: () => Promise<string>;
  resolveActiveEmergency: () => Promise<void>;
  rawResources: ApiResource[];
}

const SSEContext = createContext<SSEContextType | undefined>(undefined);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [hospital, setHospital] = useState<Hospital>(initialHospital);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [rawResources, setRawResources] = useState<ApiResource[]>([]);
  const [ambulances, setAmbulances] = useState<Ambulance[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<Record<string, AIRecommendation>>({});
  const [activeUser, setActiveUser] = useState<User>(initialUsers[0]);
  const [activeEmergencyId, setActiveEmergencyId] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  // Map Backend Resource to UI Resource
  const mapResource = (res: ApiResource): Resource => {
    let uiType: 'bed' | 'room' | 'equipment' | 'lab' | 'blood' = 'equipment';
    if (res.type === 'icu_bed' || res.type === 'er_bay') uiType = 'bed';
    else if (res.type === 'or_slot') uiType = 'room';
    else if (res.type === 'staff') uiType = 'room';

    let condition: 'Operational' | 'Maintenance' | 'Fault' | 'Reserved' | 'Occupied' = 'Operational';
    if (res.status === 'occupied') condition = 'Occupied';
    else if (res.status === 'reserved') condition = 'Reserved';
    else if (res.status === 'offline') condition = 'Maintenance';

    return {
      id: res.id,
      name: res.label,
      type: uiType,
      condition,
      departmentId: res.department
    };
  };

  // Map Backend Case to UI Patient
  const mapCaseToPatient = (c: ApiCase): Patient => {
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (c.acuity_score >= 4) priority = 'critical';
    else if (c.acuity_score === 3) priority = 'high';
    else if (c.acuity_score === 2) priority = 'medium';
    else priority = 'low';

    let status: 'unassigned' | 'triage' | 'icu-pending' | 'admitted' | 'discharged' = 'triage';
    if (c.status === 'allocated') status = 'admitted';
    else if (c.status === 'discharged') status = 'discharged';

    return {
      id: c.id,
      priority,
      name: `Case ${c.id.slice(0, 4).toUpperCase()}`,
      age: 45,
      gender: 'Unknown',
      symptoms: c.required_resource_types,
      vitals: { hr: 90, bp: '120/80', spo2: 97, temp: 37.2 },
      status,
      timeCreated: new Date(c.created_at).toLocaleTimeString().slice(0, 5),
      triageLevel: c.acuity_score,
      arrivalMethod: 'Ambulance',
      riskScore: c.acuity_score * 20
    };
  };

  // Load the full emergency state (startup / refresh / reconnect)
  const loadEmergencyState = async (emergencyId: string) => {
    try {
      const data = await api.getEmergency(emergencyId);
      setRawResources(data.resources || []);
      if (data.resources) {
        setResources(data.resources.map(mapResource));
      }
      if (data.cases) {
        setPatients(data.cases.map(mapCaseToPatient));
      }
      // Populate mock departments with some stats computed dynamically
      const activeRes = data.resources || [];
      setDepartments([
        {
          id: 'dept-icu',
          name: 'Intensive Care Unit',
          loadLevel: activeRes.filter((r: any) => r.type === 'icu_bed' && r.status === 'occupied').length > 4 ? 'Critical' : 'Normal',
          bedsCount: {
            total: activeRes.filter((r: any) => r.type === 'icu_bed').length || 10,
            occupied: activeRes.filter((r: any) => r.type === 'icu_bed' && r.status === 'occupied').length
          },
          doctorsOnDuty: 4,
          nursesOnDuty: 12
        },
        {
          id: 'dept-er',
          name: 'Emergency Department',
          loadLevel: activeRes.filter((r: any) => r.type === 'er_bay' && r.status === 'occupied').length > 6 ? 'Busy' : 'Normal',
          bedsCount: {
            total: activeRes.filter((r: any) => r.type === 'er_bay').length || 15,
            occupied: activeRes.filter((r: any) => r.type === 'er_bay' && r.status === 'occupied').length
          },
          doctorsOnDuty: 6,
          nursesOnDuty: 18
        }
      ]);
    } catch (e) {
      console.error('Failed to load emergency state', e);
      throw e;
    }
  };

  // Declare new Emergency
  const declareNewEmergency = async (): Promise<string> => {
    const res = await api.declareEmergency('mass', ['Emergency', 'ICU']);
    setActiveEmergencyId(res.id);
    localStorage.setItem('active_emergency_id', res.id);
    await loadEmergencyState(res.id);
    connect(res.id);
    return res.id;
  };

  // Resolve active emergency
  const resolveActiveEmergency = async () => {
    if (!activeEmergencyId) return;
    await api.resolveEmergency(activeEmergencyId);
    // SSE event will trigger resolution, but update locally as backup
    setEvents(prev => [{
      id: `resolved-${Date.now()}`,
      title: 'Emergency Resolved Manually',
      description: `Emergency ${activeEmergencyId.slice(0, 8)} was marked resolved.`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      type: 'system',
      severity: 'info'
    }, ...prev]);
  };

  const connect = async (emergencyId: string) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    setConnectionState(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    
    try {
      const response = await fetch(api.getStreamUrl(emergencyId), {
        headers: {
          Authorization: \`Bearer \${localStorage.getItem('auth_token') || localStorage.getItem('api_key')}\`
        },
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(\`HTTP error! status: \${response.status}\`);
      }

      setConnectionState('online');
      reconnectAttemptsRef.current = 0;

      // On successful reconnect, sync state to catch any missed updates
      if (reconnectAttemptsRef.current > 0) {
        await loadEmergencyState(emergencyId);
      }

      const parser = createParser((event) => {
        if (event.type === 'event') {
          handleServerEvent(event.event, event.data);
        }
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setConnectionState('disconnected');
      
      reconnectAttemptsRef.current++;
      const delay = Math.min(30000, Math.pow(2, reconnectAttemptsRef.current) * 1000);
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => connect(emergencyId), delay);
    }
  };

  const handleServerEvent = (eventName: string | undefined, eventData: string) => {
    if (!eventName) return;
    try {
      const data = JSON.parse(eventData);
      
      switch (eventName) {
        case 'connected':
          console.log('SSE Connected to emergency', data.emergencyId);
          break;
        case 'emergency_declared':
          setAlerts(prev => [{
            id: data.id,
            title: 'Mass Emergency Declared',
            description: \`A \${data.scope} emergency has been declared affecting \${data.department_reach?.join(', ')}\`,
            severity: 'critical',
            timestamp: new Date().toISOString(),
            acknowledged: false
          }, ...prev]);
          break;
        case 'case_added':
          setPatients(prev => {
            const newPat = mapCaseToPatient(data);
            if (prev.some(p => p.id === newPat.id)) return prev;
            return [newPat, ...prev];
          });
          setEvents(prev => [{
            id: \`evt-\${data.id}\`,
            title: 'Case Added',
            description: \`Case \${data.id.slice(0, 4).toUpperCase()} (Acuity \${data.acuity_score}) added in triage.\`,
            timestamp: new Date().toLocaleTimeString().slice(0, 5),
            type: 'admission',
            severity: 'warning'
          }, ...prev]);
          break;
        case 'bid_submitted':
          setAiRecommendations(prev => ({
            ...prev,
            [data.case_id]: {
              emergencyId: data.case_id,
              title: \`Agent Bid for \${data.resource_id}\`,
              description: data.reasoning,
              confidence: data.bid_score,
              reasoning: data.conditions || [],
              severity: data.bid_score > 90 ? 'critical' : 'high',
              actionButtons: [],
              estimatedTimeSaved: 0,
              estimatedBedsSaved: 0,
              timestamp: data.created_at
            }
          }));
          break;
        case 'round:completed':
          if (data.allocations) {
            data.allocations.forEach((alloc: any) => {
              setPatients(prev => prev.map(p => p.id === alloc.case_id ? { ...p, status: 'admitted' } : p));
              setRawResources(prev => prev.map(r => r.id === alloc.resource_id ? { ...r, status: 'occupied' } : r));
              setResources(prev => prev.map(r => r.id === alloc.resource_id ? { ...r, condition: 'Occupied' } : r));
              
              setEvents(prev => [{
                id: \`evt-alloc-\${alloc.id}\`,
                title: 'AI Allocation Confirmed',
                description: alloc.explanation,
                timestamp: new Date().toLocaleTimeString().slice(0, 5),
                type: 'treatment',
                severity: 'info'
              }, ...prev]);
            });
          }
          break;
        case 'resource_status_changed':
          setRawResources(prev => prev.map(r => r.id === data.id ? { ...r, status: data.status } : r));
          setResources(prev => prev.map(r => r.id === data.id ? mapResource(data) : r));
          break;
        case 'emergency_resolved':
          setEvents(prev => [{
            id: \`evt-res-\${data.id}\`,
            title: 'Emergency Resolved',
            description: 'The active emergency negotiation loop was closed.',
            timestamp: new Date().toLocaleTimeString().slice(0, 5),
            type: 'system',
            severity: 'info'
          }, ...prev]);
          break;
      }
    } catch (e) {
      console.error('Error parsing event data', e);
    }
  }

  // Load from local storage or declare default on startup
  useEffect(() => {
    let mounted = true;

    const startup = async () => {
      try {
        const storedId = localStorage.getItem('active_emergency_id');
        if (storedId) {
          if (mounted) {
            setActiveEmergencyId(storedId);
            await loadEmergencyState(storedId);
            connect(storedId);
          }
        } else {
          // Declare default emergency
          const res = await api.declareEmergency('mass', ['Emergency', 'ICU']);
          if (mounted) {
            setActiveEmergencyId(res.id);
            localStorage.setItem('active_emergency_id', res.id);
            await loadEmergencyState(res.id);
            connect(res.id);
          }
        }
      } catch (err) {
        console.error('Failed to run startup pipeline', err);
      }
    };

    startup();

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const triggerReconnection = () => {
    reconnectAttemptsRef.current = 0;
    if (activeEmergencyId) connect(activeEmergencyId);
  };

  const allocateResources = (
    patientId: string, 
    departmentId: string, 
    doctorName: string, 
    resourceId?: string
  ) => {
    // Manually complete local allocation
    setPatients((prev) =>
      prev.map((p) =>
        p.id === patientId ? { ...p, status: 'admitted', assignedDepartmentId: departmentId, assignedDoctor: doctorName } : p
      )
    );

    if (resourceId) {
      setRawResources(prev => prev.map(r => r.id === resourceId ? { ...r, status: 'occupied' } : r));
      setResources((prev) =>
        prev.map((res) =>
          res.id === resourceId ? { ...res, condition: 'Occupied' } : res
        )
      );
    }

    const newEvent: TimelineEvent = {
      id: \`evt-local-\${Date.now()}\`,
      timestamp: new Date().toLocaleTimeString().slice(0, 5),
      title: 'Manual Allocation Confirmed',
      description: \`Manual override of case \${patientId.slice(0,4)} assigned to \${resourceId || 'Resource'}.\`,
      type: 'treatment',
    };
    setEvents((prev) => [newEvent, ...prev]);
  };

  return (
    <SSEContext.Provider
      value={{
        connectionState,
        hospital,
        departments,
        resources,
        ambulances,
        patients,
        events,
        alerts,
        aiRecommendations,
        activeUser,
        setActiveUser,
        usersList: initialUsers,
        allocateResources,
        triggerReconnection,
        activeEmergencyId,
        setActiveEmergencyId,
        loadEmergencyState,
        declareNewEmergency,
        resolveActiveEmergency,
        rawResources
      }}
    >
      {children}
    </SSEContext.Provider>
  );
}

export function useSSE() {
  const context = useContext(SSEContext);
  if (context === undefined) {
    throw new Error('useSSE must be used within an SSEProvider');
  }
  return context;
}
`;

fs.writeFileSync('c:\\Users\\aruls\\Desktop\\SF Hackathon\\Draft_1\\src\\context\\sse-context.tsx', code, 'utf8');
console.log('Finished updating sse-context.tsx');
