'use client'

import { useState } from 'react'
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Label,
} from '@headlessui/react'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { BarsArrowUpIcon, BarsArrowDownIcon, UsersIcon } from '@heroicons/react/20/solid'

type Person = {
  id: number | null;
  name: string;
  email: string;
  crewId?: string; // backend crew id (7-char string) retained for later wiring
}

type CrewComboboxProps = {
  people: Person[];
  onSelectCrew: (person: Person & { id: number }) => void;
  loading?: boolean;
};

export default function CrewCombobox({ people, onSelectCrew, loading = false }: CrewComboboxProps) {
  const [query, setQuery] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  const filteredPeople =
    query === ''
      ? people
      : people.filter((person) =>
          person.name.toLowerCase().includes(query.toLowerCase())
        )

  const sortedPeople = [...filteredPeople].sort((a, b) => {
    const queryLower = query.toLowerCase();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    // Prioritize names that start with the query
    const aStarts = aName.startsWith(queryLower);
    const bStarts = bName.startsWith(queryLower);
    
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    // Then apply the sort direction
    return sortAsc
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name);
  })

  return (
    <div className="max-w-md">
      <Combobox
        as="div"
        value={selectedPerson}
        onChange={(person: Person | null) => {
          setQuery('');
          setSelectedPerson(null);
          if (person && person.id !== null) {
            onSelectCrew(person as Person & { id: number });
          }
        }}
      >

      <div className="mt-2 flex">
        {/* Input + user icon + chevron */}
        <div className="-mr-px relative grid grow grid-cols-1 focus-within:relative">
          <ComboboxInput
            className="col-start-1 row-start-1 block w-full rounded-l-md border border-gray-300 bg-white py-1.5 pr-8 pl-10 text-base text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:outline-none focus:ring-0 sm:pl-9 sm:text-sm/6 [&::placeholder]:text-ellipsis"
            placeholder="Oliver Ostojic"
            value={query}
            onChange={(event) => {
              const capitalized = event.target.value
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
              setQuery(capitalized);
            }}
            onBlur={() => setQuery('')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && sortedPeople.length > 0) {
                event.preventDefault()
                const personToAdd = sortedPeople[0]
                if (personToAdd && personToAdd.id !== null) {
                  onSelectCrew(personToAdd as Person & { id: number })
                  setQuery('')
                  setSelectedPerson(null)
                }
              }
            }}
            displayValue={() => query}
            style={{ fontFamily: 'var(--font-sans)' }}
          />

          {/* User icon on the left */}
          <UsersIcon
            aria-hidden="true"
            className="pointer-events-none col-start-1 row-start-1 ml-3 size-5 self-center text-gray-400 sm:size-4"
          />

          {/* Chevron button to toggle the list */}
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2 focus:outline-hidden">
            <ChevronDownIcon className="size-5 text-gray-400" aria-hidden="true" />
          </ComboboxButton>

          {/* Options dropdown */}
          <ComboboxOptions
            transition
            className="absolute z-10 mt-1 max-w-sm max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg outline outline-black/5 data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0 sm:text-sm"
          >
            {loading && (
              <div className="px-10 pr-3 py-2 text-gray-500 sm:px-9">Loading crew…</div>
            )}
            {query.length > 0 && (
              <ComboboxOption
                value={{ id: null, name: query }}
                className="cursor-default pl-10 pr-3 py-2 text-gray-900 select-none data-focus:bg-blue-50 data-focus:text-blue-700 data-focus:outline-hidden sm:pl-9"
              >
                {query}
              </ComboboxOption>
            )}

            {/* Empty states */}
            {!loading && people.length === 0 && query.length === 0 && (
              <div className="px-10 pr-3 py-2 text-gray-500 sm:px-9">No crew</div>
            )}
            {!loading && people.length > 0 && query.length > 0 && sortedPeople.length === 0 && (
              <div className="px-10 pr-3 py-2 text-gray-500 sm:px-9">No matches</div>
            )}

            {sortedPeople.map((person, index) => (
              <ComboboxOption
                key={person.id ?? person.name}
                value={person}
                className={`cursor-default pl-10 pr-3 py-2 text-gray-900 select-none data-focus:outline-hidden sm:pl-9 ${index === 0 && query.length > 0 ? 'bg-blue-50' : ''}`}
              >
                <span className={`block truncate hover:text-blue-700 hover:font-semibold data-selected:text-blue-700 data-selected:font-semibold data-focus:text-blue-700 data-focus:font-semibold ${index === 0 && query.length > 0 ? 'text-blue-700 font-semibold' : ''}`}>
                  {person.name}
                </span>
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>

        {/* Sort button on the right */}
        <button
          type="button"
          onClick={() => setSortAsc((prev) => !prev)}
          className="flex shrink-0 items-center gap-x-1.5 rounded-r-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:relative focus:outline-2 focus:-outline-offset-2 focus:outline-blue-500"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {sortAsc ? (
            <BarsArrowUpIcon
              aria-hidden="true"
              className="-ml-0.5 size-4 text-gray-400"
            />
          ) : (
            <BarsArrowDownIcon
              aria-hidden="true"
              className="-ml-0.5 size-4 text-gray-400"
            />
          )}
          <span>Sort</span>
        </button>
      </div>
    </Combobox>
    </div>
  )
}
