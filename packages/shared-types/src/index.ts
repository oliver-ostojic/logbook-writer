export interface Crew {
  id: string;
  name: string;
  // Add more crew member properties
}

export interface Schedule {
  id: string;
  date: string;
  crewId: string;
  // Add more schedule properties
}

// Export solver types
export * from './solver';