/**
 * Start page content, from the organiser's "Komunikat Organizacyjny".
 * Edit here when the organiser sends updates.
 */
export const info = {
  edition: 'IV Ogólnopolski Turniej Minisiatkówki Dziewcząt',
  name: 'Albatros CUP',
  organizer: 'UKS Opty Mielno',
  dates: '23–25 października 2026',
  datesShort: '23–25.10.2026',
  venue: {
    name: 'Hala Szkoły Podstawowej w Mielnie',
    address: 'ul. Lechitów 19, 76-032 Mielno',
    maps: 'https://www.google.com/maps/search/?api=1&query=Szko%C5%82a+Podstawowa+Mielno+ul.+Lechit%C3%B3w+19',
  },
  categories: [
    { name: 'Trójki', teams: 30, note: 'rocznik 2015 i młodsze' },
    { name: 'Dwójki', teams: 28, note: 'rocznik 2016 i młodsze' },
  ],
  reserves: 'Rezerwowe: maksymalnie 2 zawodniczki w każdej kategorii.',
  hotel: {
    name: 'Albatros Medical SPA Mielno',
    address: 'ul. Kościuszki 6, 76-032 Mielno',
    checkIn: 'od godziny 11:00 w piątek',
    maps: 'https://www.google.com/maps/search/?api=1&query=Albatros+Medical+SPA+Mielno+Ko%C5%9Bciuszki+6',
  },
  days: [
    {
      day: 'Piątek',
      date: '23.10',
      items: [
        { time: '11:00', text: 'Przyjazd i zakwaterowanie w hotelu, po przyjeździe zupa' },
        { time: '15:00', text: 'Oficjalne rozpoczęcie turnieju', highlight: true },
        { time: '15:30', text: 'Rozpoczęcie gier', highlight: true },
        { time: '', text: 'Obiadokolacja w Albatros Medical SPA' },
      ],
    },
    {
      day: 'Sobota',
      date: '24.10',
      items: [
        { time: '8:00–10:00', text: 'Śniadanie w Albatros Medical SPA' },
        { time: '9:30', text: 'Rozpoczęcie gier', highlight: true },
        { time: '12:00–14:00', text: 'Obiad na hali' },
        { time: '17:30–19:00', text: 'Obiadokolacja w Albatros Medical SPA' },
      ],
    },
    {
      day: 'Niedziela',
      date: '25.10',
      items: [
        { time: '', text: 'Śniadanie w Albatros Medical SPA' },
        { time: 'ok. 13:30', text: 'Zakończenie turnieju', highlight: true },
        { time: '', text: 'Chętne drużyny: zupa przed wyjazdem w hotelu' },
      ],
    },
  ],
  prices: [
    { label: 'Z noclegiem', price: '350 zł', per: 'od osoby', includes: 'zakwaterowanie, wyżywienie, wpisowe' },
    { label: 'Bez noclegu', price: '150 zł', per: 'od osoby', includes: 'wpisowe i sobotni obiad na hali' },
  ],
  payment: {
    account: '48 1240 1428 1111 0011 2125 5322',
    deadline: '19.10.2026',
    alt: 'lub gotówką na miejscu',
    invoiceEmail: 'krzyryw@gmail.com',
  },
  reminders: [
    'Zawodniczki zabierają ze sobą bidony do wody.',
    'Pamiętajcie o strojach kąpielowych.',
  ],
}
