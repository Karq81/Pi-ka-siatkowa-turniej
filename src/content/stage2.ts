/**
 * Second stage of Albatros CUP, from the organiser's list: after the group phase the
 * teams play in new round-robin groups for places, chosen by their group places.
 */
export interface Stage2Group { name: string; places: string; who: string }

export const STAGE2: Record<string, { legend: string; groups: Stage2Group[] }> = {
  c1: {
    legend: 'Po fazie grupowej: nowe grupy E–H (każdy z każdym) o miejsca 1–28',
    groups: [
      { name: 'Grupa E (finałowa)', places: '1–7', who: 'zwycięzcy grup i 3 najlepsze zespoły z 2. miejsc' },
      { name: 'Grupa F', places: '8–14', who: 'najsłabszy zespół z 2. miejsc, 4 zespoły z 3. miejsc i 2 najlepsze zespoły z 4. miejsc' },
      { name: 'Grupa G', places: '15–21', who: '2 najsłabsze zespoły z 4. miejsc, zespoły z 5. miejsc i najlepszy zespół z 6. miejsc' },
      { name: 'Grupa H', places: '22–28', who: '3 zespoły z 6. miejsc i 4 zespoły z 7. miejsc' },
    ],
  },
  c2: {
    legend: 'Po fazie grupowej: nowe grupy 6–10 (każdy z każdym) o miejsca 1–30',
    groups: [
      { name: 'Grupa 6 (finałowa)', places: '1–6', who: 'zwycięzcy grup i najlepszy zespół z 2. miejsc' },
      { name: 'Grupa 7', places: '7–12', who: 'kolejne 4 zespoły z 2. miejsc i 2 najlepsze zespoły z 3. miejsc' },
      { name: 'Grupa 8', places: '13–18', who: 'kolejne 3 zespoły z 3. miejsc i 3 najlepsze zespoły z 4. miejsc' },
      { name: 'Grupa 9', places: '19–24', who: 'kolejne 2 zespoły z 4. miejsc i 4 najlepsze zespoły z 5. miejsc' },
      { name: 'Grupa 10', places: '25–30', who: '1 zespół z 5. miejsc i zespoły z 6. miejsc' },
    ],
  },
}
