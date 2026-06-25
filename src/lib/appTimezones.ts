/** IANA timezone registry for the AppShell clock control panel. */
export const TIMEZONES = [
  { group: "India",          label: "Indian Standard Time (IST) — New Delhi / Kolkata", iana: "Asia/Kolkata" },
  { group: "China",          label: "China Standard Time (CST)",                         iana: "Asia/Shanghai" },
  { group: "Pakistan",       label: "Pakistan Standard Time (PKT)",                      iana: "Asia/Karachi" },
  { group: "Bangladesh",     label: "Bangladesh Standard Time (BST)",                    iana: "Asia/Dhaka" },
  { group: "Russia",         label: "Moscow Time",                                       iana: "Europe/Moscow" },
  { group: "Russia",         label: "Vladivostok Time",                                  iana: "Asia/Vladivostok" },
  { group: "Russia",         label: "Yekaterinburg Time",                                iana: "Asia/Yekaterinburg" },
  { group: "Europe",         label: "Greenwich Mean Time (GMT / UK)",                    iana: "Europe/London" },
  { group: "Europe",         label: "Central European Time (CET)",                       iana: "Europe/Paris" },
  { group: "Europe",         label: "Eastern European Time (EET)",                       iana: "Europe/Helsinki" },
  { group: "Middle East",    label: "Gulf Standard Time (GST)",                          iana: "Asia/Dubai" },
  { group: "Middle East",    label: "Arabia Standard Time (AST)",                        iana: "Asia/Riyadh" },
  { group: "Turkey",         label: "Turkey Time (TRT)",                                 iana: "Europe/Istanbul" },
  { group: "Southeast Asia", label: "Thailand Time (THA)",                               iana: "Asia/Bangkok" },
  { group: "Southeast Asia", label: "Vietnam Time (ICT)",                                iana: "Asia/Ho_Chi_Minh" },
  { group: "Southeast Asia", label: "Singapore Time (SGT)",                              iana: "Asia/Singapore" },
  { group: "Southeast Asia", label: "Malaysia Time (MYT)",                               iana: "Asia/Kuala_Lumpur" },
  { group: "Southeast Asia", label: "Philippines Time (PHT)",                            iana: "Asia/Manila" },
  { group: "USA",            label: "Eastern Time (ET)",                                 iana: "America/New_York" },
  { group: "USA",            label: "Central Time (CT)",                                 iana: "America/Chicago" },
  { group: "USA",            label: "Mountain Time (MT)",                                iana: "America/Denver" },
  { group: "USA",            label: "Pacific Time (PT)",                                 iana: "America/Los_Angeles" },
] as const;

export type IanaTimezone = typeof TIMEZONES[number]["iana"];
