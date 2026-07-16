const fs = require('fs');

const FILE_PATH = 'c:\\Users\\aruls\\Desktop\\SF Hackathon\\Draft_1\\src\\context\\sse-context.tsx';

let content = fs.readFileSync(FILE_PATH, 'utf8');

// 1. Add imports for eventsource-parser and api-service
content = content.replace(
  `import { initialEvents, initialUsers, initialHospital } from '@/mock';`,
  `import { initialEvents, initialUsers, initialHospital } from '@/mock';\nimport { createParser } from 'eventsource-parser';\nimport { api } from '@/lib/api-service';`
);

// 2. Add activeEmergencyId state
content = content.replace(
  `const [activeUser, setActiveUser] = useState<User>(initialUsers[0]);`,
  `const [activeUser, setActiveUser] = useState<User>(initialUsers[0]);\n  const [activeEmergencyId, setActiveEmergencyId] = useState<string | null>(null);\n  const abortControllerRef = useRef<AbortController | null>(null);`
);

// 3. Replace the entire connect() function and event listeners
const oldConnectStart = content.indexOf('const connect = () => {');
const oldConnectEnd = content.indexOf('useEffect(() => {');
if (oldConnectStart !== -1 && oldConnectEnd !== -1) {
  const newConnect = `
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
            const newPat: Patient = {
              id: data.id,
              priority: data.acuity_score >= 4 ? 'critical' : data.acuity_score === 3 ? 'high' : 'medium',
              name: \`Patient \${data.id.split('-')[0].toUpperCase()}\`,
              age: 45,
              gender: 'Unknown',
              symptoms: data.required_resource_types,
              vitals: { hr: 90, bp: '120/80', spo2: 98, temp: 37 },
              status: 'triage',
              timeCreated: data.created_at,
              triageLevel: data.acuity_score,
              arrivalMethod: 'Ambulance',
              riskScore: data.acuity_score * 20
            };
            if (prev.some(p => p.id === newPat.id)) return prev;
            return [newPat, ...prev];
          });
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
               allocateResources(alloc.case_id, 'ER', 'AI Auto', alloc.resource_id);
            });
          }
          break;
        case 'resource_status_changed':
          setResources(prev => prev.map(r => r.id === data.id ? { ...r, condition: data.status === 'available' ? 'Operational' : 'Occupied' } : r));
          break;
      }
    } catch (e) {
      console.error('Error parsing event data', e);
    }
  }

  `;
  content = content.substring(0, oldConnectStart) + newConnect + content.substring(oldConnectEnd);
}

// 4. Update useEffect to fetch a new emergency or existing one
const oldUseEffectStart = content.indexOf('useEffect(() => {');
const oldUseEffectEnd = content.indexOf('const triggerReconnection = () => {');
if (oldUseEffectStart !== -1 && oldUseEffectEnd !== -1) {
  const newUseEffect = `
  useEffect(() => {
    let mounted = true;

    const initEmergency = async () => {
      try {
        // Since we don't have a specific emergency, we create a mass emergency on mount for the demo
        // Or if there's an active one, we'd fetch it. For now, we just declare one.
        const res = await api.declareEmergency('mass', ['Emergency', 'ICU']);
        if (mounted) {
          setActiveEmergencyId(res.id);
          connect(res.id);
        }
      } catch (err) {
        console.error('Failed to init emergency', err);
      }
    };

    initEmergency();

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

  `;
  content = content.substring(0, oldUseEffectStart) + newUseEffect + content.substring(oldUseEffectEnd);
}

// 5. Update triggerReconnection
content = content.replace(
  `const triggerReconnection = () => {\n    reconnectAttemptsRef.current = 0;\n    connect();\n  };`,
  `const triggerReconnection = () => {\n    reconnectAttemptsRef.current = 0;\n    if (activeEmergencyId) connect(activeEmergencyId);\n  };`
);

fs.writeFileSync(FILE_PATH, content);
console.log('Replaced SSE content successfully.');
